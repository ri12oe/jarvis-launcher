export const VOICE_SAMPLE_RATE = 16000;

const SPEECH_RMS = 800;
const MIN_SPEECH_MS = 280;
/** How long a pause ends a request. config.json "voice.pauseMs" changes it. */
export const DEFAULT_PAUSE_MS = 1600;
export const PAUSE_RANGE = { min: 700, max: 4000 } as const;
/** After this much talking it's a long request, and people stop to think mid-sentence. */
const LONG_REQUEST_MS = 4000;
const LONG_REQUEST_EXTRA_MS = 600;
/** One request can be about a minute long. */
export const MAX_UTTERANCE_MS = 60000;
const START_TIMEOUT_MS = 4500;

export interface EndpointState {
  chunks: Int16Array[];
  heardSpeech: boolean;
  speechMs: number;
  silenceMs: number;
  elapsedMs: number;
}

export function createEndpoint(): EndpointState {
  return { chunks: [], heardSpeech: false, speechMs: 0, silenceMs: 0, elapsedMs: 0 };
}

export function rmsInt16(samples: Int16Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const value = samples[i];
    sum += value * value;
  }
  return Math.sqrt(sum / samples.length);
}

export function stepEndpoint(
  state: EndpointState,
  chunk: Int16Array,
  sampleRate = VOICE_SAMPLE_RATE,
  pauseMs = DEFAULT_PAUSE_MS,
): { state: EndpointState; done: boolean; speech: boolean } {
  const ms = sampleRate > 0 ? (chunk.length / sampleRate) * 1000 : 0;
  const speechNow = rmsInt16(chunk) >= SPEECH_RMS;
  const heardSpeech = state.heardSpeech || speechNow;
  const next: EndpointState = {
    chunks: state.chunks.concat(chunk),
    heardSpeech,
    speechMs: state.speechMs + (speechNow ? ms : 0),
    silenceMs: speechNow ? 0 : heardSpeech ? state.silenceMs + ms : 0,
    elapsedMs: state.elapsedMs + ms,
  };
  const enough = next.speechMs >= MIN_SPEECH_MS;
  const pause = next.speechMs >= LONG_REQUEST_MS ? pauseMs + LONG_REQUEST_EXTRA_MS : pauseMs;
  const done =
    (next.heardSpeech && enough && next.silenceMs >= pause) ||
    next.elapsedMs >= MAX_UTTERANCE_MS ||
    (!next.heardSpeech && next.elapsedMs >= START_TIMEOUT_MS);
  return { state: next, done, speech: next.heardSpeech && enough };
}

export function takeSamples(state: EndpointState): Int16Array {
  const total = state.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Int16Array(total);
  let offset = 0;
  for (const chunk of state.chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export function resampleLinear(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (input.length === 0 || fromRate <= 0 || toRate <= 0) return new Float32Array(0);
  if (fromRate === toRate) return input.slice();
  const ratio = fromRate / toRate;
  const length = Math.max(1, Math.floor(input.length / ratio));
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const position = i * ratio;
    const index = Math.floor(position);
    const fraction = position - index;
    const left = input[index] ?? 0;
    const right = input[Math.min(index + 1, input.length - 1)] ?? left;
    out[i] = left + (right - left) * fraction;
  }
  return out;
}

export function floatToPcm16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const sample = Math.max(-1, Math.min(1, input[i]));
    out[i] = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff);
  }
  return out;
}

/** 16-bit mono PCM WAV. xAI speech-to-text accepts this container. */
export function encodeWavPcm16(samples: Int16Array, sampleRate = VOICE_SAMPLE_RATE): Uint8Array {
  const dataBytes = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, dataBytes, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    view.setInt16(offset, samples[i], true);
    offset += 2;
  }
  return new Uint8Array(buffer);
}
