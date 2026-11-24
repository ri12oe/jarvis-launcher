import { describe, expect, it } from "vitest";
import { cloneDefaultConfig, DEFAULT_HOTKEY, isValidHotkey, parseConfig, parseConfigText } from "../src/shared/config";

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
});
