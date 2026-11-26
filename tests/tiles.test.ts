import { describe, expect, it } from "vitest";
import { cloneDefaultConfig } from "../src/shared/config";
import { composeTiles } from "../src/shared/tiles";
import type { DiscoveredApp } from "../src/shared/types";

const env = {
  platform: "win32" as const,
  edgeExecutables: ["C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"],
  explorerPath: "C:\\Windows\\explorer.exe",
  folders: {
    desktop: "C:\\Users\\Mario\\Desktop",
    documents: "C:\\Users\\Mario\\Documents",
    downloads: "C:\\Users\\Mario\\Downloads",
    pictures: "C:\\Users\\Mario\\Pictures",
  },
};

const cursor: DiscoveredApp = {
  id: "cursor",
  label: "Cursor",
  source: "shortcut",
  launchKind: "shortcut",
  launchPath: "C:\\Start\\Cursor.lnk",
};

describe("composeTiles", () => {
  it("places discovered apps before the fixed tiles and pinned folders", () => {
    const config = cloneDefaultConfig();
    config.pinnedFolders = [{ id: "projects", label: "Projects", path: "D:\\Projects" }];
    config.extraTiles = [{ id: "scratch", label: "Scratch", path: "D:\\scratch.txt", kind: "app" }];
    const tiles = composeTiles(config, [cursor], env);
    expect(tiles.map((tile) => tile.id)).toEqual([
      "cursor",
      "edge",
      "explorer",
      "desktop",
      "documents",
      "downloads",
      "pictures",
      "gemini-web",
      "github-web",
      "x",
      "projects",
      "scratch",
    ]);
  });

  it("hides disabled ids, renames tiles, and pulls ordered ids forward", () => {
    const config = cloneDefaultConfig();
    config.disabled = ["downloads", "cursor", "gemini-web", "github-web", "x"];
    config.labels = { edge: "Browser" };
    config.order = ["pictures", "explorer"];
    const tiles = composeTiles(config, [cursor], env);
    expect(tiles.map((tile) => tile.id)).toEqual([
      "pictures",
      "explorer",
      "edge",
      "desktop",
      "documents",
    ]);
    expect(tiles.find((tile) => tile.id === "edge")?.label).toBe("Browser");
  });

  it("adds web fallbacks for Gemini, GitHub, and X, and drops one when the desktop app exists", () => {
    const gemini = { ...cursor, id: "gemini" as const, label: "Gemini", launchPath: "C:\\gemini.lnk" };
    const tiles = composeTiles(cloneDefaultConfig(), [gemini], env);
    const ids = tiles.map((tile) => tile.id);
    expect(ids).not.toContain("gemini-web");
    expect(ids).toContain("github-web");
    expect(tiles.find((tile) => tile.id === "x")?.action).toEqual({ type: "openExternal", url: "https://x.com/" });
  });
});
