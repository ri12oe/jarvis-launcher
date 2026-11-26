import { describe, expect, it } from "vitest";
import { systemHelperScript } from "../src/main/system-controls";
import {
  checkSystemAction,
  confirmText,
  formatTrackTime,
  mediaPosition,
  parseHelperReply,
  parseSystemState,
  powerClick,
  webSearchUrl,
} from "../src/shared/system";

describe("power confirmation", () => {
  it("needs a second click within five seconds for shut down, restart, and sign out", () => {
    const first = powerClick(null, "shutdown", 1000);
    expect(first).toEqual({ run: false, pending: { action: "shutdown", until: 6000 } });
    expect(powerClick(first.pending, "shutdown", 5999)).toEqual({ run: true, pending: null });
    expect(powerClick(first.pending, "shutdown", 6001).run).toBe(false);
    expect(powerClick(first.pending, "restart", 2000)).toEqual({ run: false, pending: { action: "restart", until: 7000 } });
    expect(powerClick(null, "signout", 0).run).toBe(false);
  });

  it("runs sleep and lock at once and clears anything armed", () => {
    expect(powerClick({ action: "shutdown", until: 9999 }, "lock", 0)).toEqual({ run: true, pending: null });
    expect(powerClick(null, "sleep", 0)).toEqual({ run: true, pending: null });
    expect(confirmText("shutdown")).toBe("SHUT DOWN?  CLICK AGAIN TO CONFIRM");
  });
});

describe("system action checks", () => {
  it("allows only known actions and clamps values", () => {
    expect(checkSystemAction("lock", undefined)).toEqual({ action: "lock", value: 0 });
    expect(checkSystemAction("volume-set", 140)).toEqual({ action: "volume-set", value: 100 });
    expect(checkSystemAction("volume-set", -3.6)).toEqual({ action: "volume-set", value: 0 });
    expect(checkSystemAction("volume-step", -5.4)).toEqual({ action: "volume-step", value: -5 });
    expect(checkSystemAction("brightness-set", 55.5)).toEqual({ action: "brightness-set", value: 56 });
    expect(checkSystemAction("media-seek", 12.25)).toEqual({ action: "media-seek", value: 12.25 });
    expect(checkSystemAction("volume-set", "50")).toBeNull();
    expect(checkSystemAction("volume-set", Number.NaN)).toBeNull();
    expect(checkSystemAction("format-c", 0)).toBeNull();
    expect(checkSystemAction(42, 0)).toBeNull();
  });
});

describe("helper replies", () => {
  it("reads a full state and treats -1 as not available", () => {
    const state = parseSystemState({
      volume: 45,
      muted: 0,
      mic: 1,
      brightness: -1,
      media: {
        title: "Song",
        artist: "Band",
        app: "Spotify.exe",
        status: "Playing",
        position: 72.5,
        duration: 214,
        updated: 1_700_000_000_000,
      },
    });
    expect(state.volume).toBe(45);
    expect(state.muted).toBe(false);
    expect(state.micMuted).toBe(true);
    expect(state.brightness).toBeNull();
    expect(state.media).toMatchObject({ title: "Song", artist: "Band", status: "playing", position: 72.5, duration: 214 });
  });

  it("drops a media session with no title or artist, and survives junk", () => {
    expect(parseSystemState({ volume: -1, media: { title: "", artist: "", status: "Playing" } })).toEqual({
      volume: null,
      muted: null,
      micMuted: null,
      brightness: null,
      media: null,
    });
    expect(parseSystemState("nope").volume).toBeNull();
    expect(parseHelperReply('{"id":3,"ok":true,"data":null}')).toEqual({ id: 3, ok: true, data: null });
    expect(parseHelperReply("WARNING: something")).toBeNull();
  });

  it("moves the track time forward only while playing", () => {
    const media = { title: "a", artist: "", app: "", status: "playing" as const, position: 10, duration: 20, updatedMs: 1000 };
    expect(mediaPosition(media, 4000)).toBe(13);
    expect(mediaPosition(media, 60_000)).toBe(20);
    expect(mediaPosition({ ...media, status: "paused" }, 60_000)).toBe(10);
    expect(formatTrackTime(0)).toBe("0:00");
    expect(formatTrackTime(187)).toBe("3:07");
    expect(formatTrackTime(3729)).toBe("1:02:09");
  });
});

describe("web search", () => {
  it("builds an encoded Google URL and rejects empty or long queries", () => {
    expect(webSearchUrl("  weather & news ")).toBe("https://www.google.com/search?q=weather%20%26%20news");
    expect(webSearchUrl("   ")).toBeNull();
    expect(webSearchUrl("x".repeat(301))).toBeNull();
    expect(webSearchUrl(12)).toBeNull();
  });
});

describe("system helper script", () => {
  const script = systemHelperScript();

  it("is one line with no comments, and the C# has no single quotes", () => {
    expect(script).not.toMatch(/\n/);
    expect(script).not.toMatch(/(^|;)\s*#/);
    const start = script.indexOf("Add-Type -TypeDefinition '") + "Add-Type -TypeDefinition '".length;
    const csharp = script.slice(start, script.indexOf("';", start));
    expect(csharp).toContain("IJarvisEndpointVolume");
    expect(csharp).not.toContain("'");
    expect(csharp).not.toContain("//");
  });

  it("has balanced braces and parentheses", () => {
    const count = (char: string) => script.split(char).length - 1;
    expect(count("{")).toBe(count("}"));
    expect(count("(")).toBe(count(")"));
  });

  it("answers every op the main process sends", () => {
    for (const op of ["state", "vol", "volstep", "mute", "mic", "bright", "prev", "toggle", "next", "seek", "sleep"]) {
      expect(script).toContain(`$op -eq '${op}'`);
    }
  });
});
