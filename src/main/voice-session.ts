import { readVoiceApiKey, voicePreferenceOn } from "../shared/config";
import type { LaunchResult, VoiceConfig, VoiceSnapshot } from "../shared/types";
import {
  createEndpoint,
  encodeWavPcm16,
  stepEndpoint,
  takeSamples,
  VOICE_SAMPLE_RATE,
  type EndpointState,
} from "../shared/voice-audio";
import { actionForTranscript, type VoiceTile } from "../shared/voice-command";
import {
  acceptsCloudAudio,
  createWakeGate,
  initialVoiceHud,
  reduceVoice,
  stepWakeGate,
  type VoiceHud,
  type WakeGate,
} from "../shared/voice-state";
import {
  appendChatHistory,
  completeChat,
  jarvisSystemPrompt,
  redactSecret,
  synthesizeSpeech,
  transcribeWav,
  type ChatMessage,
} from "../shared/xai";
import { createWakeWord, type WakeWord } from "./wakeword";

const SAFE_ERRORS = new Set([
  "Microphone is unavailable",
  "Could not play speech",
  "Could not save the voice setting",
]);

export interface VoiceHost {
  tiles(): readonly VoiceTile[];
  voice(): VoiceConfig;
  env(): NodeJS.ProcessEnv;
  configText(): string | undefined;
  writeConfig(text: string): boolean;
  show(): void;
  hide(): void;
  launch(tileId: string): Promise<LaunchResult>;
  refresh(): Promise<void>;
  publish(snapshot: VoiceSnapshot): void;
  speak(audio: Uint8Array, contentType: string): void;
  modelDir(): string;
  patchEnabled(text: string, enabled: boolean): string | undefined;
}

export interface VoiceSession {
  start(): Promise<void>;
  stop(): void;
  apply(): void;
  onPcm(samples: Int16Array): void;
  setEnabled(enabled: boolean): Promise<void>;
  /** Push to talk: start listening as if the wake word was heard, or cancel listening. */
  talk(): { ok: boolean; error?: string };
  playbackEnded(): void;
  reportError(message: string): void;
  snapshot(): VoiceSnapshot;
}

export function createVoiceSession(host: VoiceHost): VoiceSession {
  let hud: VoiceHud = initialVoiceHud();
  let gate: WakeGate = createWakeGate();
  let endpoint: EndpointState = createEndpoint();
  let engine: WakeWord | undefined;
  let loading = false;
  let engineFailed = false;
  let generation = 0;
  let abort = new AbortController();
  let error = "";
  let launchError = "";
  let history: ChatMessage[] = [];
  let overrideEnabled: boolean | undefined;
  let stopped = false;
  const queue: Int16Array[] = [];
  let queued = 0;
  let pumping = false;

  function alive(gen: number): boolean {
    return gen === generation && !stopped;
  }

  function requestSignal(): AbortSignal {
    return AbortSignal.any([abort.signal, AbortSignal.timeout(25000)]);
  }

  function refreshAbort(): void {
    abort.abort();
    abort = new AbortController();
  }

  function hasKey(): boolean {
    const voice = host.voice();
    return readVoiceApiKey(host.env(), voice.apiKeyEnv) !== undefined;
  }

  function enabled(): boolean {
    if (overrideEnabled !== undefined) return overrideEnabled;
    return voicePreferenceOn(host.voice(), hasKey());
  }

  function snapshot(): VoiceSnapshot {
    const key = hasKey();
    const on = enabled();
    return {
      hasKey: key,
      enabled: on,
      // A tap on the emblem listens even when the wake word model did not load.
      capture:
        (Boolean(engine) || hud.phase === "listening") && key && on && !stopped,
      phase: hud.phase,
      heard: hud.heard,
      reply: hud.reply,
      error,
      launchError,
    };
  }

  function publish(): void {
    host.publish(snapshot());
  }

  async function loadEngine(): Promise<void> {
    if (engine || loading || engineFailed || stopped) return;
    loading = true;
    try {
      engine = await createWakeWord(host.modelDir());
      if (error === "Wake word model is unavailable") error = "";
    } catch {
      engine = undefined;
      engineFailed = true;
      error = "Wake word model is unavailable";
      hud = reduceVoice(hud, { type: "fail" });
    } finally {
      loading = false;
      publish();
    }
  }

  function apply(): void {
    const voice = host.voice();
    if (overrideEnabled !== undefined && voice.enabled === overrideEnabled)
      overrideEnabled = undefined;
    const key = hasKey();
    const on = enabled();
    if (!key) error = "";
    if ((!key || !on) && hud.phase !== "idle") {
      generation += 1;
      refreshAbort();
      hud = reduceVoice(hud, { type: "stop" });
    }
    publish();
    if (key && on) void loadEngine();
  }

  function onWake(): void {
    generation += 1;
    refreshAbort();
    endpoint = createEndpoint();
    error = "";
    launchError = "";
    hud = reduceVoice(initialVoiceHud(), { type: "wake" });
    host.show();
    publish();
  }

  async function consume(chunk: Int16Array): Promise<void> {
    if (hud.phase === "listening") {
      try {
        await consumeCommand(chunk);
      } catch {
        error = "Voice failed";
        generation += 1;
        hud = reduceVoice(hud, { type: "fail" });
        publish();
      }
      return;
    }
    if (!engine) return;
    try {
      const score = await engine.push(chunk);
      if (score !== undefined) {
        const stepped = stepWakeGate(gate, score, Date.now());
        gate = stepped.gate;
        if (stepped.hit) onWake();
      }
    } catch {
      engine = undefined;
      engineFailed = true;
      error = "Wake word model is unavailable";
      generation += 1;
      hud = reduceVoice(hud, { type: "fail" });
      publish();
    }
  }

  async function consumeCommand(chunk: Int16Array): Promise<void> {
    const gen = generation;
    if (!acceptsCloudAudio(hud.phase)) return;
    const stepped = stepEndpoint(endpoint, chunk, VOICE_SAMPLE_RATE);
    endpoint = stepped.state;
    if (!stepped.done) return;
    if (!stepped.speech) {
      hud = reduceVoice(hud, { type: "transcript", text: "" });
      publish();
      return;
    }
    hud = reduceVoice(hud, { type: "working" });
    publish();
    // Keep reading the mic so the on-device wake word can abort this request.
    // Speech during thinking is not uploaded.
    void transcribeAndAct(gen, takeSamples(endpoint));
  }

  async function transcribeAndAct(
    gen: number,
    samples: Int16Array,
  ): Promise<void> {
    const voice = host.voice();
    const key = readVoiceApiKey(host.env(), voice.apiKeyEnv);
    if (!key || !alive(gen)) {
      hud = reduceVoice(hud, { type: "stop" });
      publish();
      return;
    }
    let transcript = "";
    try {
      transcript = await transcribeWav({
        apiKey: key,
        model: voice.sttModel,
        wav: encodeWavPcm16(samples, VOICE_SAMPLE_RATE),
        signal: requestSignal(),
      });
    } catch {
      if (!alive(gen)) return;
      error = "Could not transcribe";
      hud = reduceVoice(hud, { type: "fail" });
      publish();
      return;
    }
    if (!alive(gen)) return;
    const action = actionForTranscript(transcript, host.tiles());
    if (action.type === "ignore" || action.type === "stop") {
      hud = reduceVoice(hud, { type: "stop" });
      publish();
      return;
    }
    if (action.type === "hide") {
      hud = reduceVoice(hud, { type: "stop" });
      publish();
      host.hide();
      return;
    }
    hud = reduceVoice(hud, { type: "heard", text: transcript });
    publish();
    if (action.type === "refresh") {
      void host.refresh().catch(() => undefined);
      await say(gen, "Refreshing.");
      return;
    }
    if (action.type === "open") {
      void host.launch(action.tileId).then((result) => {
        if (!alive(gen) || result.ok) return;
        launchError = publicText(result.error, key) || "Launch failed";
        publish();
      });
      await say(gen, action.say);
      return;
    }
    await chat(gen, action.text);
  }

  async function chat(gen: number, text: string): Promise<void> {
    const voice = host.voice();
    const key = readVoiceApiKey(host.env(), voice.apiKeyEnv);
    if (!key || !alive(gen)) return;
    const tiles = host.tiles();
    try {
      const result = await completeChat({
        apiKey: key,
        model: voice.model,
        messages: [
          { role: "system", content: jarvisSystemPrompt(tiles) },
          ...history,
          { role: "user", content: text },
        ],
        tileIds: tiles.map((tile) => tile.id),
        signal: requestSignal(),
      });
      if (!alive(gen)) return;
      if (result.tileId) {
        const tile = tiles.find((item) => item.id === result.tileId);
        const line = result.text || (tile ? `Opening ${tile.label}.` : "");
        if (tile) {
          void host.launch(tile.id).then((launched) => {
            if (!alive(gen) || launched.ok) return;
            launchError = publicText(launched.error, key) || "Launch failed";
            publish();
          });
        }
        history = appendChatHistory(history, text, line || "Opening that.");
        await say(gen, line);
        return;
      }
      const line = result.text.trim();
      if (!line) {
        hud = reduceVoice(hud, { type: "reply", text: "" });
        publish();
        return;
      }
      history = appendChatHistory(history, text, line);
      await say(gen, line);
    } catch {
      if (!alive(gen)) return;
      error = "Could not reach Grok";
      hud = reduceVoice(hud, { type: "fail" });
      publish();
    }
  }

  async function say(gen: number, line: string): Promise<void> {
    const trimmed = line.trim();
    if (!trimmed || !alive(gen)) {
      hud = reduceVoice(hud, { type: "reply", text: "" });
      publish();
      return;
    }
    const voice = host.voice();
    const key = readVoiceApiKey(host.env(), voice.apiKeyEnv);
    if (!key) {
      hud = reduceVoice(hud, { type: "reply", text: trimmed });
      hud = reduceVoice(hud, { type: "fail" });
      publish();
      return;
    }
    try {
      const audio = await synthesizeSpeech({
        apiKey: key,
        text: trimmed,
        voiceId: voice.voiceId,
        signal: requestSignal(),
      });
      if (!alive(gen)) return;
      hud = reduceVoice(hud, { type: "reply", text: trimmed });
      publish();
      host.speak(audio.bytes, audio.contentType);
    } catch {
      if (!alive(gen)) return;
      error = "Could not speak";
      hud = reduceVoice(hud, { type: "reply", text: trimmed });
      hud = reduceVoice(hud, { type: "fail" });
      publish();
    }
  }

  async function pump(): Promise<void> {
    if (pumping) return;
    pumping = true;
    try {
      while (queue.length > 0 && !stopped) {
        const chunk = queue.shift();
        if (!chunk) break;
        queued -= chunk.length;
        await consume(chunk);
      }
    } finally {
      pumping = false;
      if (queue.length > 0 && !stopped) void pump();
    }
  }

  return {
    start() {
      apply();
      return Promise.resolve();
    },
    stop() {
      stopped = true;
      generation += 1;
      refreshAbort();
      queue.splice(0);
      queued = 0;
    },
    apply,
    onPcm(samples) {
      if (stopped || !snapshot().capture) return;
      queue.push(samples);
      queued += samples.length;
      while (queued > VOICE_SAMPLE_RATE * 2 && queue.length > 1) {
        const dropped = queue.shift();
        if (dropped) queued -= dropped.length;
      }
      void pump();
    },
    async setEnabled(next) {
      const text = host.configText();
      const patched =
        text === undefined ? undefined : host.patchEnabled(text, next);
      if (!patched || !host.writeConfig(patched)) {
        error = "Could not save the voice setting";
        publish();
        return;
      }
      overrideEnabled = next;
      error = "";
      if (next) engineFailed = false;
      apply();
    },
    talk() {
      if (stopped) return { ok: false, error: "Voice is stopped" };
      if (!hasKey()) return { ok: false, error: "Voice needs an xAI API key" };
      if (!enabled()) return { ok: false, error: "Voice is off" };
      if (hud.phase === "listening") {
        generation += 1;
        refreshAbort();
        hud = reduceVoice(hud, { type: "stop" });
        publish();
        return { ok: true };
      }
      onWake();
      return { ok: true };
    },
    playbackEnded() {
      if (hud.phase !== "speaking") return;
      hud = reduceVoice(hud, { type: "played" });
      publish();
    },
    reportError(message) {
      const safe = SAFE_ERRORS.has(message)
        ? message
        : "Microphone is unavailable";
      error = safe;
      generation += 1;
      refreshAbort();
      hud = reduceVoice(hud, { type: "fail" });
      publish();
    },
    snapshot,
  };
}

function publicText(value: string | undefined, secret: string): string {
  const cleaned = redactSecret(
    (value ?? "").replace(/\s+/g, " ").trim(),
    secret,
  );
  return cleaned.slice(0, 140);
}
