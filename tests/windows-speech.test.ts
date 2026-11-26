import { describe, expect, it } from "vitest";
import {
  parseSpeechReply,
  speechHelperScript,
  speechRequestLine,
} from "../src/main/windows-speech";

describe("Windows speech helper", () => {
  it("is one line and uses the built-in Windows voice", () => {
    const script = speechHelperScript();
    expect(script.includes("\n")).toBe(false);
    expect(script).toContain("System.Speech");
    expect(script).toContain("SetOutputToWaveStream");
  });

  it("sends ASCII-only JSON, so quotes and accents reach PowerShell intact", () => {
    const line = speechRequestLine(3, "david", 'Say "hi" — café\nnow');
    expect(/^[\x20-\x7e]+$/.test(line)).toBe(true);
    expect(JSON.parse(line)).toEqual({
      id: 3,
      voice: "david",
      text: 'Say "hi" — café\nnow',
    });
  });

  it("reads WAV audio and failures, and ignores other lines", () => {
    const ok = parseSpeechReply(
      JSON.stringify({
        id: 1,
        ok: true,
        audio: Buffer.from("RIFF").toString("base64"),
      }),
    );
    expect(ok?.ok).toBe(true);
    if (ok?.ok) expect(Buffer.from(ok.audio).toString()).toBe("RIFF");
    expect(
      parseSpeechReply(JSON.stringify({ id: 2, ok: false, error: "no voice" })),
    ).toEqual({ id: 2, ok: false });
    expect(parseSpeechReply("warning: something")).toBeUndefined();
    expect(
      parseSpeechReply(JSON.stringify({ id: null, ok: false })),
    ).toBeUndefined();
  });
});
