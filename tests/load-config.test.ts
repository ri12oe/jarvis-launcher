import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/load";
import { DEFAULT_HOTKEY } from "../src/shared/config";

const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("loadConfig", () => {
  it("writes defaults on first run", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-cfg-"));
    temps.push(dir);
    const loaded = loadConfig(dir);
    expect(loaded.config.hotkey).toBe(DEFAULT_HOTKEY);
    expect(loaded.warnings).toEqual([]);
    const written = JSON.parse(fs.readFileSync(loaded.filePath, "utf8")) as { hotkey: string };
    expect(written.hotkey).toBe(DEFAULT_HOTKEY);
  });

  it("reads a valid file and leaves a broken file untouched", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-cfg-"));
    temps.push(dir);
    const file = path.join(dir, "config.json");
    const broken = "{ this is not json";
    fs.writeFileSync(file, broken);
    const loaded = loadConfig(dir);
    expect(loaded.config.hotkey).toBe(DEFAULT_HOTKEY);
    expect(loaded.warnings[0]).toMatch(/not valid JSON/);
    expect(fs.readFileSync(file, "utf8")).toBe(broken);

    fs.writeFileSync(
      file,
      JSON.stringify({
        hotkey: "Ctrl+Alt+K",
        pinnedFolders: [{ id: "work", label: "Work", path: "C:\\Work" }],
      }),
    );
    const again = loadConfig(dir);
    expect(again.config.hotkey).toBe("Ctrl+Alt+K");
    expect(again.config.pinnedFolders[0]?.label).toBe("Work");
    expect(again.warnings).toEqual([]);
  });
});
