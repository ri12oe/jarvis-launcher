import fs from "node:fs";
import path from "node:path";
import type { InferenceSession, Tensor } from "onnxruntime-node";

const FRAME = 1280;
const MEL_CONTEXT = 480;
const MEL_BINS = 32;
const EMBED_DIM = 96;
const EMBED_WINDOW = 76;
const CLASSIFIER_FRAMES = 16;
const RAW_CAP = 16000 * 10;
const MEL_CAP = 10 * 97;
const FEATURE_CAP = 120;
const WARMUP_SCORES = 5;

type Ort = typeof import("onnxruntime-node");

export interface WakeWord {
  /** Returns the highest score from any full 80 ms frame in this chunk. */
  push(samples: Int16Array): Promise<number | undefined>;
}

/**
 * On-device "hey jarvis" detector.
 * The ONNX files are openWakeWord v0.5.1 pre-trained models
 * (CC BY-NC-SA 4.0, https://github.com/dscripka/openWakeWord/releases/tag/v0.5.1).
 * The project code is Apache-2.0. The models are not.
 * Audio is 16 kHz mono PCM. Nothing here leaves the machine.
 */
export async function createWakeWord(dir: string): Promise<WakeWord> {
  const melPath = path.join(dir, "melspectrogram.onnx");
  const embedPath = path.join(dir, "embedding_model.onnx");
  const wakePath = path.join(dir, "hey_jarvis_v0.1.onnx");
  if (!fs.existsSync(melPath) || !fs.existsSync(embedPath) || !fs.existsSync(wakePath)) {
    throw new Error("Wake word model is unavailable");
  }
  const ort: Ort = await import("onnxruntime-node");
  const options = { executionProviders: ["cpu" as const], intraOpNumThreads: 1, interOpNumThreads: 1 };
  const mel = await ort.InferenceSession.create(melPath, options);
  const embed = await ort.InferenceSession.create(embedPath, options);
  const wake = await ort.InferenceSession.create(wakePath, options);
  return new Engine(ort, mel, embed, wake);
}

/** Prefer the unpacked copy. onnxruntime cannot read a model that is still inside app.asar. */
export function resolveWakeDir(appPath: string): string {
  const packed = path.join(appPath, "assets", "wake");
  const unpacked = packed.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`);
  const candidate = path.join(unpacked, "hey_jarvis_v0.1.onnx");
  return fs.existsSync(candidate) ? unpacked : packed;
}

class Engine implements WakeWord {
  private readonly raw = new Float32Array(RAW_CAP);
  private rawStart = 0;
  private rawCount = 0;
  private pending = new Int16Array(0);
  private mel: Float32Array[] = Array.from({ length: EMBED_WINDOW }, () => ones(MEL_BINS));
  private features: Float32Array[] = [];
  private scored = 0;

  constructor(
    private readonly ort: Ort,
    private readonly melSession: InferenceSession,
    private readonly embedSession: InferenceSession,
    private readonly wakeSession: InferenceSession,
  ) {}

  async push(samples: Int16Array): Promise<number | undefined> {
    const merged = new Int16Array(this.pending.length + samples.length);
    merged.set(this.pending);
    merged.set(samples, this.pending.length);
    let offset = 0;
    let best: number | undefined;
    while (merged.length - offset >= FRAME) {
      const score = await this.frame(merged.subarray(offset, offset + FRAME));
      best = best === undefined ? score : Math.max(best, score);
      offset += FRAME;
    }
    this.pending = merged.slice(offset);
    return best;
  }

  private async frame(samples: Int16Array): Promise<number> {
    const floats = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) floats[i] = samples[i];
    this.pushRaw(floats);
    if (this.rawCount < FRAME) return 0;
    const audio = this.lastRaw(Math.min(this.rawCount, FRAME + MEL_CONTEXT));
    const rows = await this.melspec(audio);
    for (const row of rows) this.mel.push(row);
    if (this.mel.length > MEL_CAP) this.mel.splice(0, this.mel.length - MEL_CAP);
    if (this.mel.length < EMBED_WINDOW) return 0;
    this.features.push(await this.embed(this.mel.slice(this.mel.length - EMBED_WINDOW)));
    if (this.features.length > FEATURE_CAP) this.features.splice(0, this.features.length - FEATURE_CAP);
    if (this.features.length < CLASSIFIER_FRAMES) return 0;
    this.scored += 1;
    if (this.scored <= WARMUP_SCORES) return 0;
    return this.classify(this.features.slice(this.features.length - CLASSIFIER_FRAMES));
  }

  private pushRaw(values: Float32Array): void {
    for (let i = 0; i < values.length; i++) {
      if (this.rawCount === this.raw.length) {
        this.raw[this.rawStart] = values[i];
        this.rawStart = (this.rawStart + 1) % this.raw.length;
      } else {
        this.raw[(this.rawStart + this.rawCount) % this.raw.length] = values[i];
        this.rawCount += 1;
      }
    }
  }

  private lastRaw(count: number): Float32Array {
    const length = Math.min(count, this.rawCount);
    const out = new Float32Array(length);
    const start = (this.rawStart + this.rawCount - length) % this.raw.length;
    for (let i = 0; i < length; i++) out[i] = this.raw[(start + i) % this.raw.length];
    return out;
  }

  private async melspec(audio: Float32Array): Promise<Float32Array[]> {
    const tensor = new this.ort.Tensor("float32", audio, [1, audio.length]);
    const output = await this.melSession.run({ input: tensor });
    const values = floatsFrom(output.output);
    if (values.length % MEL_BINS !== 0) throw new Error("Wake word model is unavailable");
    const frames = values.length / MEL_BINS;
    const rows: Float32Array[] = [];
    for (let frame = 0; frame < frames; frame++) {
      const row = new Float32Array(MEL_BINS);
      for (let bin = 0; bin < MEL_BINS; bin++) row[bin] = values[frame * MEL_BINS + bin] / 10 + 2;
      rows.push(row);
    }
    return rows;
  }

  private async embed(window: Float32Array[]): Promise<Float32Array> {
    const data = new Float32Array(EMBED_WINDOW * MEL_BINS);
    for (let i = 0; i < EMBED_WINDOW; i++) data.set(window[i], i * MEL_BINS);
    const tensor = new this.ort.Tensor("float32", data, [1, EMBED_WINDOW, MEL_BINS, 1]);
    const output = await this.embedSession.run({ input_1: tensor });
    const values = floatsFrom(output[this.embedSession.outputNames[0]]);
    const embedding = new Float32Array(EMBED_DIM);
    embedding.set(values.subarray(0, EMBED_DIM));
    return embedding;
  }

  private async classify(frames: Float32Array[]): Promise<number> {
    const data = new Float32Array(CLASSIFIER_FRAMES * EMBED_DIM);
    for (let i = 0; i < CLASSIFIER_FRAMES; i++) data.set(frames[i], i * EMBED_DIM);
    const tensor = new this.ort.Tensor("float32", data, [1, CLASSIFIER_FRAMES, EMBED_DIM]);
    const output = await this.wakeSession.run({ "x.1": tensor });
    const values = floatsFrom(output[this.wakeSession.outputNames[0]]);
    const score = values[0] ?? 0;
    if (score < 0) return 0;
    if (score > 1) return 1;
    return score;
  }
}

function ones(length: number): Float32Array {
  const row = new Float32Array(length);
  row.fill(1);
  return row;
}

function floatsFrom(value: Tensor | undefined): Float32Array {
  const data = value?.data;
  if (data instanceof Float32Array) return data;
  throw new Error("Wake word model is unavailable");
}
