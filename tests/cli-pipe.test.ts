import { describe, expect, it, vi } from "vitest";
import { handleCliLine, pipeName, tokensMatch } from "../src/main/cli-pipe";
import { cloneDefaultConfig } from "../src/shared/config";

vi.mock("../src/main/wakeword", () => ({
  createWakeWord: async () => {
    throw new Error("no model");
  },
}));
const { createVoiceSession } = await import("../src/main/voice-session");

describe("jarvis terminal pipe", () => {
  it("names a per-user pipe", () => {
    expect(pipeName("maesp")).toBe("\\\\.\\pipe\\jarvis-launcher-maesp");
    expect(pipeName("a b/c")).toBe("\\\\.\\pipe\\jarvis-launcher-a_b_c");
  });

  it("refuses requests without the token, answers ping, and passes text on", async () => {
    const ask = vi.fn(async (text: string, speak: boolean) => ({
      ok: true,
      lines: [`${text}:${speak}`],
    }));
    expect(tokensMatch("abc", "abc")).toBe(true);
    expect(tokensMatch("abc", "abd")).toBe(false);
    expect(
      await handleCliLine('{"token":"nope","text":"hi"}', "secret", ask),
    ).toEqual({ ok: false, lines: [], error: "Not allowed" });
    expect(await handleCliLine("not json", "secret", ask)).toMatchObject({
      ok: false,
      error: "Bad request",
    });
    expect(
      await handleCliLine('{"token":"secret","ping":true}', "secret", ask),
    ).toEqual({ ok: true, lines: [], pong: true });
    expect(
      await handleCliLine('{"token":"secret","text":"  "}', "secret", ask),
    ).toMatchObject({ error: "Nothing to ask" });
    expect(
      await handleCliLine(
        '{"token":"secret","text":"open edge","speak":true}',
        "secret",
        ask,
      ),
    ).toEqual({ ok: true, lines: ["open edge:true"] });
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("runs a typed command through the same path as speech, silently", async () => {
    const launched: string[] = [];
    const spoken: number[] = [];
    const voice = createVoiceSession({
      tiles: () => [{ id: "edge", label: "Microsoft Edge" }],
      voice: () => cloneDefaultConfig().voice,
      env: () => ({ GROQ_API_KEY: "gsk_test" }),
      configText: () => "{}",
      writeConfig: () => true,
      show: () => undefined,
      hide: () => undefined,
      launch: async (id) => {
        launched.push(id);
        return { ok: true };
      },
      refresh: async () => undefined,
      publish: () => undefined,
      speak: () => spoken.push(1),
      synthesize: async () => ({
        bytes: new Uint8Array([1]),
        contentType: "audio/wav",
      }),
      control: async () => undefined,
      computerTask: () => undefined,
      modelDir: () => "/nowhere",
      patchEnabled: (text) => text,
      deepEnabled: () => false,
      deepStatus: () => "",
    });
    const quiet = await voice.ask("open edge", false);
    expect(quiet.ok).toBe(true);
    expect(quiet.lines.join(" ")).toMatch(/Edge/);
    expect(launched).toEqual(["edge"]);
    expect(spoken).toEqual([]);
    expect(voice.snapshot().phase).toBe("idle");

    const loud = await voice.ask("open edge", true);
    expect(loud.ok).toBe(true);
    expect(spoken).toEqual([1]);
  });

  it("explains a missing key", async () => {
    const voice = createVoiceSession({
      tiles: () => [],
      voice: () => cloneDefaultConfig().voice,
      env: () => ({}),
      configText: () => "{}",
      writeConfig: () => true,
      show: () => undefined,
      hide: () => undefined,
      launch: async () => ({ ok: true }),
      refresh: async () => undefined,
      publish: () => undefined,
      speak: () => undefined,
      synthesize: async () => ({
        bytes: new Uint8Array([1]),
        contentType: "audio/wav",
      }),
      control: async () => undefined,
      computerTask: () => undefined,
      modelDir: () => "/nowhere",
      patchEnabled: (text) => text,
      deepEnabled: () => false,
      deepStatus: () => "",
    });
    expect(await voice.ask("hello", false)).toEqual({
      ok: false,
      lines: [],
      error: "Voice needs a Groq API key",
    });
  });
});
