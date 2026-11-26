import { describe, expect, it } from "vitest";
import {
  cloneDefaultConfig,
  DEFAULT_CHAT_MODEL,
  DEFAULT_HOTKEY,
  DEFAULT_STT_MODEL,
  isAllowedKeyEnv,
  isValidHotkey,
  parseConfig,
  parseConfigText,
  patchVoiceEnabledText,
  readVoiceApiKey,
  voicePreferenceOn,
} from "../src/shared/config";

describe("config parsing", () => {
  it("accepts a sensible hotkey and rejects bare keys", () => {
    expect(isValidHotkey("CommandOrControl+Alt+J")).toBe(true);
    expect(isValidHotkey("Ctrl+Alt+J")).toBe(true);
    expect(isValidHotkey("Ctrl+Shift+J")).toBe(true);
    expect(isValidHotkey("Alt+F12")).toBe(true);
    expect(isValidHotkey("Shift+J")).toBe(false);
    expect(isValidHotkey("J")).toBe(false);
    expect(isValidHotkey("")).toBe(false);
  });

  it("returns defaults for non-objects and broken JSON", () => {
    for (const input of [null, [], 3, "nope", undefined]) {
      const parsed = parseConfig(input);
      expect(parsed.config).toEqual(cloneDefaultConfig());
      expect(parsed.warnings.length).toBeGreaterThan(0);
    }
    const text = parseConfigText("{");
    expect(text.config).toEqual(cloneDefaultConfig());
    expect(text.warnings[0]).toMatch(/not valid JSON/);
  });

  it("keeps valid fields and drops bad ones", () => {
    const parsed = parseConfig({
      hotkey: 12,
      openAtLogin: "yes",
      startHidden: true,
      pinnedFolders: [
        { id: "projects", label: "Projects", path: "C:\\Users\\Mario\\Projects" },
        { id: "projects", label: "Again", path: "C:\\Users\\Mario\\Other" },
        { id: "edge", label: "Not Edge", path: "C:\\Temp" },
        { label: "Missing" },
        { id: "notes", label: "Notes", path: "relative\\notes" },
      ],
      extraTiles: [
        { id: "notes", label: "Notes", path: "D:\\Notes\\notes.txt", kind: "app" },
        { id: "bad", label: "Bad", path: "D:\\Ok", kind: "website" },
      ],
      disabled: ["copilot", "copilot", "", 4],
      order: ["explorer", "edge"],
      labels: { cursor: "Cursor IDE", "": "nope", edge: "" },
      unknown: true,
    });

    expect(parsed.config.hotkey).toBe(DEFAULT_HOTKEY);
    expect(parsed.config.openAtLogin).toBe(false);
    expect(parsed.config.startHidden).toBe(true);
    expect(parsed.config.pinnedFolders).toEqual([
      { id: "projects", label: "Projects", path: "C:\\Users\\Mario\\Projects" },
    ]);
    expect(parsed.config.extraTiles).toEqual([
      { id: "notes", label: "Notes", path: "D:\\Notes\\notes.txt", kind: "app" },
    ]);
    expect(parsed.config.disabled).toEqual(["copilot"]);
    expect(parsed.config.order).toEqual(["explorer", "edge"]);
    expect(parsed.config.labels).toEqual({ cursor: "Cursor IDE" });
    expect(parsed.warnings.length).toBeGreaterThan(0);
  });

  it("defaults launchWindow to a centered 70 percent window", () => {
    expect(parseConfig({}).config.launchWindow).toEqual({ mode: "centered", widthPct: 70, heightPct: 70 });
    expect(parseConfig({}).warnings).toEqual([]);
    expect(parseConfig({ launchWindow: { mode: "default" } }).config.launchWindow).toEqual({
      mode: "default",
      widthPct: 70,
      heightPct: 70,
    });
    const sized = parseConfig({ launchWindow: { mode: "centered", widthPct: 80, heightPct: 60.4 } });
    expect(sized.warnings).toEqual([]);
    expect(sized.config.launchWindow).toEqual({ mode: "centered", widthPct: 80, heightPct: 60 });
    expect(parseConfig({ launchWindow: { widthPct: 10, heightPct: 100 } }).config.launchWindow).toEqual({
      mode: "centered",
      widthPct: 10,
      heightPct: 100,
    });
  });

  it("drops a bad launchWindow and keeps the other fields", () => {
    const parsed = parseConfig({
      hotkey: "Ctrl+Alt+K",
      launchWindow: { mode: "fullscreen", widthPct: 9, heightPct: "70" },
    });
    expect(parsed.config.hotkey).toBe("Ctrl+Alt+K");
    expect(parsed.config.launchWindow).toEqual({ mode: "centered", widthPct: 70, heightPct: 70 });
    expect(parsed.warnings).toEqual([
      'launchWindow.mode must be "centered" or "default"; using centered',
      "launchWindow.widthPct must be a number from 10 to 100; using 70",
      "launchWindow.heightPct must be a number from 10 to 100; using 70",
    ]);
    const broken = parseConfig({ launchWindow: [] });
    expect(broken.config.launchWindow).toEqual({ mode: "centered", widthPct: 70, heightPct: 70 });
    expect(broken.warnings).toEqual(["launchWindow must be an object; using the centered default"]);
  });

  it("validates the voice block and leaves the key out of the file", () => {
    expect(parseConfig({}).config.voice).toEqual({
      apiKeyEnv: "GROQ_API_KEY",
      model: DEFAULT_CHAT_MODEL,
      voiceId: "george",
      sttModel: DEFAULT_STT_MODEL,
    });
    expect(parseConfig({}).config.voice.enabled).toBeUndefined();
    const turnedOff = parseConfig({
      voice: {
        enabled: false,
        model: "llama-3.3-70b-versatile",
        voiceId: "ZIRA",
        apiKeyEnv: "GROQ_CUSTOM",
        sttModel: "whisper-large-v3",
      },
    });
    expect(turnedOff.warnings).toEqual([]);
    expect(turnedOff.config.voice).toEqual({
      enabled: false,
      apiKeyEnv: "GROQ_CUSTOM",
      model: "llama-3.3-70b-versatile",
      voiceId: "zira",
      sttModel: "whisper-large-v3",
    });
    // A config written for xAI falls back to the Groq models.
    const old = parseConfig({
      voice: { model: "grok-4.7", voiceId: "eve", apiKeyEnv: "XAI_API_KEY", sttModel: "grok-voice-transcribe-2.0" },
    });
    expect(old.config.voice).toEqual(parseConfig({}).config.voice);
    expect(old.warnings.join(" ")).toMatch(/GROQ_/);
    expect(isAllowedKeyEnv("GROQ_API_KEY")).toBe(true);
    expect(isAllowedKeyEnv("XAI_API_KEY")).toBe(false);
    expect(isAllowedKeyEnv("JARVIS_KEY")).toBe(false);
    const foreign = parseConfig({ voice: { apiKeyEnv: "JARVIS_KEY" } });
    expect(foreign.config.voice.apiKeyEnv).toBe("GROQ_API_KEY");
    expect(foreign.warnings.join(" ")).toMatch(/GROQ_/);
    const broken = parseConfig({ voice: { enabled: "yes", model: "not a model", apiKeyEnv: "1KEY", voiceId: "" } });
    expect(broken.config.voice.enabled).toBeUndefined();
    expect(broken.config.voice.model).toBe(DEFAULT_CHAT_MODEL);
    expect(broken.config.voice.apiKeyEnv).toBe("GROQ_API_KEY");
    expect(broken.warnings.join(" ")).toMatch(/voice.enabled/);
    expect(parseConfig({ voice: { effect: "none" } }).config.voice.effect).toBe("none");
    expect(parseConfig({}).config.voice.effect).toBeUndefined();
    expect(parseConfig({ voice: { effect: "loud" } }).warnings.join(" ")).toMatch(/voice.effect/);
    expect(parseConfig({ voice: [] }).warnings).toEqual(["voice must be an object; using defaults"]);
    expect(voicePreferenceOn(parseConfig({}).config.voice, true)).toBe(true);
    expect(voicePreferenceOn(parseConfig({}).config.voice, false)).toBe(false);
    expect(voicePreferenceOn(parseConfig({ voice: { enabled: false } }).config.voice, true)).toBe(false);
    expect(voicePreferenceOn(parseConfig({ voice: { enabled: true } }).config.voice, false)).toBe(true);
    expect(readVoiceApiKey({ GROQ_API_KEY: "  secret  " }, "GROQ_API_KEY")).toBe("secret");
    expect(readVoiceApiKey({ GROQ_API_KEY: "   " }, "GROQ_API_KEY")).toBeUndefined();
    const patched = patchVoiceEnabledText('{"hotkey":"Ctrl+Alt+J","voice":{"model":"grok-4.7"}}', false);
    expect(patched).toBeDefined();
    expect(JSON.parse(patched ?? "{}")).toEqual({
      hotkey: "Ctrl+Alt+J",
      voice: { model: "grok-4.7", enabled: false },
    });
    expect(patchVoiceEnabledText("{", true)).toBeUndefined();
    expect(patched?.includes("secret")).toBe(false);
  });

  it("accepts POSIX and UNC paths", () => {
    const parsed = parseConfig({
      pinnedFolders: [
        { id: "work", label: "Work", path: "/home/mario/work" },
        { id: "share", label: "Share", path: "\\\\files\\mario" },
      ],
    });
    expect(parsed.config.pinnedFolders.map((folder) => folder.id)).toEqual(["work", "share"]);
    expect(parsed.warnings).toEqual([]);
  });

  it("reads an optional weather location and rejects bad coordinates", () => {
    const good = parseConfig({ weather: { latitude: 39.77, longitude: -86.16, label: "Indianapolis, IN" } });
    expect(good.config.weather).toEqual({ latitude: 39.77, longitude: -86.16, label: "Indianapolis, IN", units: "fahrenheit" });
    expect(good.warnings).toEqual([]);
    expect(parseConfig({}).config.weather).toBeUndefined();
    const bad = parseConfig({ weather: { latitude: 120, longitude: 0 } });
    expect(bad.config.weather).toBeUndefined();
    expect(bad.warnings.join(" ")).toContain("weather.latitude");
    const celsius = parseConfig({ weather: { latitude: 0, longitude: 0, units: "celsius" } });
    expect(celsius.config.weather?.units).toBe("celsius");
  });

  it("reserves the web tile ids", () => {
    const parsed = parseConfig({ extraTiles: [{ id: "x", label: "Mine", path: "C:\\x.exe", kind: "app" }] });
    expect(parsed.config.extraTiles).toEqual([]);
  });
});
