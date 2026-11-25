import { describe, expect, it } from "vitest";
import {
  actionForTranscript,
  chatInterrupt,
  matchTile,
  normalizeSpeech,
  parseVoiceCommand,
  scoreTileLabel,
  type VoiceTile,
} from "../src/shared/voice-command";

const tiles: VoiceTile[] = [
  { id: "edge", label: "Microsoft Edge" },
  { id: "explorer", label: "File Explorer" },
  { id: "projects", label: "Projects" },
  { id: "pictures", label: "Pictures" },
  { id: "downloads", label: "Downloads" },
];

describe("fuzzy tile matching", () => {
  it("matches a label word, a full label, and a near miss", () => {
    expect(matchTile("edge", tiles)?.id).toBe("edge");
    expect(matchTile("microsoft edge", tiles)?.id).toBe("edge");
    expect(matchTile("file explorer", tiles)?.id).toBe("explorer");
    expect(matchTile("explorr", tiles)?.id).toBe("explorer");
    expect(matchTile("the projects folder", tiles)?.id).toBe("projects");
    expect(matchTile("pictures", tiles)?.id).toBe("pictures");
    expect(matchTile("download", tiles)?.id).toBe("downloads");
  });

  it("refuses fragments that are too short or too far", () => {
    expect(matchTile("e", tiles)).toBeUndefined();
    expect(matchTile("pic", tiles)).toBeUndefined();
    expect(matchTile("zzzz", tiles)).toBeUndefined();
    expect(matchTile("edge browser", tiles)).toBeUndefined();
    expect(scoreTileLabel("pictures", "Pictures")).toBe(1);
    expect(scoreTileLabel("pictures", "Downloads")).toBeLessThan(0.72);
  });
});

describe("voice commands", () => {
  it("normalizes punctuation before matching", () => {
    expect(normalizeSpeech("Open Edge!")).toBe("open edge");
    expect(parseVoiceCommand("Open Edge!", tiles)).toEqual({ type: "open", tileId: "edge", label: "Microsoft Edge" });
  });

  it("parses hide, refresh, and stop before chat", () => {
    expect(parseVoiceCommand("hide.", tiles).type).toBe("hide");
    expect(parseVoiceCommand("hide the window", tiles).type).toBe("hide");
    expect(parseVoiceCommand("refresh the list", tiles).type).toBe("refresh");
    expect(parseVoiceCommand("cancel", tiles).type).toBe("stop");
    expect(parseVoiceCommand("never mind", tiles).type).toBe("stop");
    expect(parseVoiceCommand("please launch file explorer", tiles)).toEqual({
      type: "open",
      tileId: "explorer",
      label: "File Explorer",
    });
  });

  it("sends everything else to chat, including an open that misses", () => {
    expect(parseVoiceCommand("what's the weather", tiles)).toEqual({ type: "chat", text: "what's the weather" });
    expect(parseVoiceCommand("open the flux capacitor", tiles)).toEqual({
      type: "chat",
      text: "open the flux capacitor",
    });
    expect(actionForTranscript("   ", tiles)).toEqual({ type: "ignore" });
    expect(chatInterrupt("hey jarvis")).toBe("wake");
    expect(chatInterrupt("Stop.")).toBe("stop");
    expect(chatInterrupt("cancel")).toBe("stop");
    expect(chatInterrupt("what's the weather")).toBeUndefined();
    expect(actionForTranscript("open projects", tiles)).toEqual({
      type: "open",
      tileId: "projects",
      label: "Projects",
      say: "Opening Projects.",
    });
  });
});
