import { describe, expect, it } from "vitest";
import { cloneDefaultConfig } from "../src/shared/config";
import {
  acceleratorFromKey,
  checkSettings,
  geocodeUrl,
  mergeSettings,
  parseGeocode,
  settingsFromConfig,
} from "../src/shared/settings";
import { confirmText, powerClick, checkSystemAction } from "../src/shared/system";

const base = () => settingsFromConfig(cloneDefaultConfig());

describe("settings values", () => {
  it("accepts the defaults and a full set of good values", () => {
    expect(checkSettings(base())).toBeNull();
    expect(
      checkSettings({
        ...base(),
        hotkey: "Ctrl+Shift+Space",
        openAtLogin: true,
        weather: { latitude: 39.77, longitude: -86.16, label: "Indianapolis, IN", units: "celsius" },
        dock: ["spotify", null, null, "documents"],
        plates: { "TEN OPF": "chatgpt" },
      }),
    ).toBeNull();
  });

  it("rejects what config.json would reject", () => {
    expect(checkSettings({ ...base(), hotkey: "J" })).toMatch(/hotkey/i);
    expect(checkSettings({ ...base(), plates: { NOPE: "chatgpt" } })).toMatch(/no plate reads/);
    expect(checkSettings({ ...base(), weather: { latitude: 200, longitude: 0, label: "", units: "fahrenheit" } })).toMatch(
      /latitude/,
    );
    expect(checkSettings({ ...base(), dock: ["bad id!", null, null, null] })).toMatch(/dock slot 1/);
    expect(checkSettings(null)).toBe("Settings are missing");
    expect(checkSettings({ ...base(), openAtLogin: "yes" })).toBe("Startup options are missing");
  });

  it("changes only the keys it owns and keeps everything else", () => {
    const raw = {
      hotkey: "Ctrl+Alt+J",
      extraTiles: [{ id: "steam", label: "Steam", path: "C:\\steam.exe", kind: "app" }],
      voice: { enabled: true },
      weather: { latitude: 1, longitude: 2, label: "Old", units: "fahrenheit" },
      somethingNew: 42,
    };
    const merged = mergeSettings(raw, { ...base(), hotkey: " Ctrl+Alt+K ", weather: null, dock: ["steam", null, null, null] });
    expect(merged.hotkey).toBe("Ctrl+Alt+K");
    expect(merged.extraTiles).toEqual(raw.extraTiles);
    expect(merged.voice).toEqual({ enabled: true });
    expect(merged.somethingNew).toBe(42);
    expect("weather" in merged).toBe(false);
    expect(merged.dock).toEqual(["steam", null, null, null]);
    expect(Object.keys(merged).slice(0, 4)).toEqual(["hotkey", "extraTiles", "voice", "somethingNew"]);
  });
});

describe("city search", () => {
  it("builds the Open-Meteo geocoding URL and reads its results", () => {
    const url = new URL(geocodeUrl(" Indianapolis ")!);
    expect(url.host).toBe("geocoding-api.open-meteo.com");
    expect(url.searchParams.get("name")).toBe("Indianapolis");
    expect(geocodeUrl("a")).toBeNull();
    expect(geocodeUrl("x".repeat(81))).toBeNull();
    expect(
      parseGeocode({
        results: [
          { name: "Indianapolis", admin1: "Indiana", country_code: "US", latitude: 39.76838, longitude: -86.15804 },
          { name: "Broken" },
        ],
      }),
    ).toEqual([{ label: "Indianapolis, Indiana, US", latitude: 39.77, longitude: -86.16 }]);
    expect(parseGeocode({})).toEqual([]);
  });
});

describe("hotkey capture", () => {
  const key = (k: string, mods: Partial<Record<"ctrlKey" | "altKey" | "shiftKey" | "metaKey", boolean>> = {}) =>
    acceleratorFromKey({ key: k, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods });

  it("turns key presses into accelerators and ignores bare keys and modifiers", () => {
    expect(key("j", { ctrlKey: true, altKey: true })).toBe("CommandOrControl+Alt+J");
    expect(key(" ", { ctrlKey: true, shiftKey: true })).toBe("CommandOrControl+Shift+Space");
    expect(key("F5", { altKey: true })).toBe("Alt+F5");
    expect(key("ArrowUp", { metaKey: true })).toBe("Super+Up");
    expect(key("j")).toBeNull();
    expect(key("Control", { ctrlKey: true })).toBeNull();
    expect(key("é", { ctrlKey: true })).toBeNull();
  });
});

describe("recycle bin and task manager actions", () => {
  it("allows the new actions and asks before emptying the bin", () => {
    expect(checkSystemAction("open-taskmgr", undefined)).toEqual({ action: "open-taskmgr", value: 0 });
    expect(checkSystemAction("open-recyclebin", undefined)).toEqual({ action: "open-recyclebin", value: 0 });
    const first = powerClick(null, "empty-recyclebin", 0);
    expect(first.run).toBe(false);
    expect(powerClick(first.pending, "empty-recyclebin", 1000).run).toBe(true);
    expect(confirmText("empty-recyclebin")).toBe("EMPTY RECYCLE BIN?  RIGHT-CLICK AGAIN TO CONFIRM");
  });
});
