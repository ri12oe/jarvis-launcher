import { describe, expect, it, vi } from "vitest";
import { cloneDefaultConfig } from "../src/shared/config";
import type { VoiceSnapshot } from "../src/shared/types";

// The wake word model fails to load, to prove push to talk does not need it.
vi.mock("../src/main/wakeword", () => ({
  createWakeWord: async () => {
    throw new Error("no model");
  },
}));

const { createVoiceSession } = await import("../src/main/voice-session");

function session(env: NodeJS.ProcessEnv) {
  const published: VoiceSnapshot[] = [];
  let shown = 0;
  const voice = createVoiceSession({
    tiles: () => [],
    voice: () => cloneDefaultConfig().voice,
    env: () => env,
    configText: () => "{}",
    writeConfig: () => true,
    show: () => {
      shown++;
    },
    hide: () => undefined,
    launch: async () => ({ ok: true }),
    refresh: async () => undefined,
    publish: (snapshot) => published.push(snapshot),
    speak: () => undefined,
    synthesize: async () => ({ bytes: new Uint8Array([1]), contentType: "audio/wav" }),
    control: async () => undefined,
    computerTask: () => undefined,
    modelDir: () => "/nowhere",
    patchEnabled: (text) => text,
    deepEnabled: () => false,
    deepStatus: () => "",
  });
  return { voice, published, shown: () => shown };
}

describe("push to talk", () => {
  it("says why it cannot listen without a key", () => {
    const { voice } = session({});
    expect(voice.talk()).toEqual({ ok: false, error: "Voice needs a Groq API key" });
    expect(voice.snapshot().phase).toBe("idle");
  });

  it("listens on a tap, captures the mic without the wake word model, and a second tap stops", async () => {
    const { voice, shown } = session({ GROQ_API_KEY: "gsk_test-key" });
    await voice.start();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(voice.snapshot().capture).toBe(false);
    expect(voice.talk()).toEqual({ ok: true });
    expect(voice.snapshot().phase).toBe("listening");
    expect(voice.snapshot().capture).toBe(true);
    expect(shown()).toBe(1);
    expect(voice.talk()).toEqual({ ok: true });
    expect(voice.snapshot().phase).toBe("idle");
    voice.stop();
  });
});

describe("announcements", () => {
  it("speaks a deep think result when idle, and waits while Jarvis is listening", async () => {
    const { voice, published } = session({ GROQ_API_KEY: "gsk_test-key" });
    await voice.start();
    voice.announce("Your portfolio is ready.");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(voice.snapshot().phase).toBe("speaking");
    expect(voice.snapshot().reply).toBe("Your portfolio is ready.");
    voice.playbackEnded();
    expect(voice.talk()).toEqual({ ok: true });
    voice.announce("Second update.");
    expect(voice.snapshot().phase).toBe("listening");
    voice.talk();
    await new Promise((resolve) => setTimeout(resolve, 450));
    expect(published.some((snapshot) => snapshot.reply === "Second update.")).toBe(true);
    voice.stop();
  });
});
