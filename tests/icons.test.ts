import { describe, expect, it } from "vitest";
import { cloneDefaultConfig } from "../src/shared/config";
import { PLACEHOLDER_ICON, tileFallbackIcon, tileIconFile } from "../src/shared/icons";
import { composeTiles } from "../src/shared/tiles";
import type { DiscoveredApp } from "../src/shared/types";

const env = {
  platform: "win32" as const,
  edgeExecutables: [] as string[],
  explorerPath: "C:\\Windows\\explorer.exe",
  folders: {
    desktop: "C:\\Users\\Mario\\Desktop",
    documents: "C:\\Users\\Mario\\Documents",
    downloads: "C:\\Users\\Mario\\Downloads",
    pictures: "C:\\Users\\Mario\\Pictures",
  },
};

const store: DiscoveredApp = {
  id: "chatgpt",
  label: "ChatGPT",
  source: "store",
  launchKind: "store",
  launchPath: "OpenAI.ChatGPT-Desktop_2p2nqsdnc2c4m!App",
};

function tile(id: string, discovered: DiscoveredApp[] = [], edgeExecutables: string[] = []) {
  const tiles = composeTiles(cloneDefaultConfig(), discovered, { ...env, edgeExecutables });
  const found = tiles.find((item) => item.id === id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
}

describe("tile icons", () => {
  it("uses a file path for Edge, Explorer, and folders when one exists", () => {
    const edge = tile("edge", [], ["C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"]);
    expect(tileIconFile(edge)).toBe("C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe");
    expect(tileFallbackIcon(edge)).toBeUndefined();
    expect(tileIconFile(tile("explorer"))).toBe("C:\\Windows\\explorer.exe");
    expect(tileFallbackIcon(tile("explorer"))).toBeUndefined();
    expect(tileIconFile(tile("desktop"))).toBe("C:\\Users\\Mario\\Desktop");
    expect(tileFallbackIcon(tile("desktop"))).toBeUndefined();
  });

  it("uses the HUD placeholder for the Edge protocol and Store apps", () => {
    const edge = tile("edge");
    expect(edge.action).toEqual({ type: "openExternal", url: "microsoft-edge:" });
    expect(tileIconFile(edge)).toBeUndefined();
    expect(tileFallbackIcon(edge)).toBe(PLACEHOLDER_ICON);
    const chat = tile("chatgpt", [store]);
    expect(chat.action).toEqual({
      type: "spawn",
      command: "C:\\Windows\\explorer.exe",
      args: ["shell:AppsFolder\\OpenAI.ChatGPT-Desktop_2p2nqsdnc2c4m!App"],
    });
    expect(tileIconFile(chat)).toBeUndefined();
    expect(tileFallbackIcon(chat)).toBe(PLACEHOLDER_ICON);
    expect(PLACEHOLDER_ICON.startsWith("data:image/svg+xml,")).toBe(true);
  });
});
