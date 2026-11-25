import { describe, expect, it } from "vitest";
import { cloneDefaultConfig } from "../src/shared/config";
import { EventEmitter } from "node:events";
import { defaultEdgeCandidates, runLaunch, spawnDetached, windowsExplorerPath } from "../src/shared/launch";
import type { SpawnedChild } from "../src/shared/launch";
import { composeTiles } from "../src/shared/tiles";
import type { DiscoveredApp, LaunchAction } from "../src/shared/types";

const folders = {
  desktop: "C:\\Users\\Mario\\Desktop",
  documents: "C:\\Users\\Mario\\Documents",
  downloads: "C:\\Users\\Mario\\Downloads",
  pictures: "C:\\Users\\Mario\\Pictures",
};

const edgeExe = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

function tilesWith(edgeExecutables: string[], discovered: DiscoveredApp[] = []) {
  const config = cloneDefaultConfig();
  config.pinnedFolders = [{ id: "projects", label: "Projects", path: "C:\\Users\\Mario\\Projects" }];
  return composeTiles(config, discovered, {
    platform: "win32",
    edgeExecutables,
    explorerPath: windowsExplorerPath("C:\\Windows"),
    folders,
  });
}

function action(tiles: ReturnType<typeof tilesWith>, id: string): LaunchAction {
  const tile = tiles.find((item) => item.id === id);
  if (!tile) throw new Error(`missing ${id}`);
  return tile.action;
}

describe("launch paths", () => {
  it("opens Edge, File Explorer, and folders through the right calls", async () => {
    const calls: string[] = [];
    const deps = {
      openPath: async (targetPath: string) => {
        calls.push(`openPath ${targetPath}`);
        return "";
      },
      openExternal: async (url: string) => {
        calls.push(`openExternal ${url}`);
      },
      spawn: (command: string, args: readonly string[]) => {
        calls.push(`spawn ${command} ${args.join(" ")}`.trim());
      },
    };

    const installed = tilesWith([edgeExe]);
    await runLaunch(action(installed, "edge"), deps);
    await runLaunch(action(installed, "explorer"), deps);
    await runLaunch(action(installed, "desktop"), deps);
    await runLaunch(action(installed, "documents"), deps);
    await runLaunch(action(installed, "downloads"), deps);
    await runLaunch(action(installed, "pictures"), deps);
    await runLaunch(action(installed, "projects"), deps);

    expect(calls).toEqual([
      `openPath ${edgeExe}`,
      "spawn C:\\Windows\\explorer.exe",
      "openPath C:\\Users\\Mario\\Desktop",
      "openPath C:\\Users\\Mario\\Documents",
      "openPath C:\\Users\\Mario\\Downloads",
      "openPath C:\\Users\\Mario\\Pictures",
      "openPath C:\\Users\\Mario\\Projects",
    ]);
  });

  it("falls back to the Edge protocol when the executable is not installed", async () => {
    const calls: string[] = [];
    await runLaunch(action(tilesWith([]), "edge"), {
      openPath: async (targetPath) => {
        calls.push(targetPath);
        return "";
      },
      openExternal: async (url) => {
        calls.push(url);
      },
      spawn: () => {
        throw new Error("explorer should not launch");
      },
    });
    expect(calls).toEqual(["microsoft-edge:"]);
  });

  it("opens a discovered shortcut and reports an openPath failure", async () => {
    const lnk = "C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\Cursor.lnk";
    const tiles = tilesWith(
      [],
      [
        {
          id: "cursor",
          label: "Cursor",
          source: "shortcut",
          launchKind: "shortcut",
          launchPath: lnk,
        },
      ],
    );
    const opened: string[] = [];
    await expect(
      runLaunch(action(tiles, "cursor"), {
        openPath: async (targetPath) => {
          opened.push(targetPath);
          return "Failed to open";
        },
        openExternal: async () => undefined,
        spawn: () => undefined,
      }),
    ).rejects.toThrow("Failed to open");
    expect(opened).toEqual([lnk]);
  });

  it("launches a Store app through explorer shell:AppsFolder", async () => {
    const calls: string[] = [];
    const tiles = tilesWith(
      [],
      [
        {
          id: "chatgpt",
          label: "ChatGPT",
          source: "store",
          launchKind: "store",
          launchPath: "OpenAI.ChatGPT-Desktop_2p2nqsdnc2c4m!App",
        },
      ],
    );
    await runLaunch(action(tiles, "chatgpt"), {
      openPath: async () => "",
      openExternal: async () => undefined,
      spawn: (command, args) => {
        calls.push(`${command} ${args.join(" ")}`);
      },
    });
    expect(calls).toEqual([
      "C:\\Windows\\explorer.exe shell:AppsFolder\\OpenAI.ChatGPT-Desktop_2p2nqsdnc2c4m!App",
    ]);
  });

  it("rejects a failed spawn so the caller can report it", async () => {
    const child = new EventEmitter() as EventEmitter & SpawnedChild;
    child.unref = () => {
      throw new Error("unref should wait until spawn succeeds");
    };
    const pending = spawnDetached("C:\\Windows\\explorer.exe", [], () => {
      queueMicrotask(() => child.emit("error", new Error("spawn ENOENT")));
      return child;
    });
    await expect(pending).rejects.toThrow("spawn ENOENT");

    await expect(
      runLaunch(
        { type: "spawn", command: "C:\\Windows\\explorer.exe", args: [] },
        {
          openPath: async () => "",
          openExternal: async () => undefined,
          spawn: () => Promise.reject(new Error("spawn ENOENT")),
        },
      ),
    ).rejects.toThrow("spawn ENOENT");
  });

  it("builds the default Edge candidate paths", () => {
    expect(
      defaultEdgeCandidates({
        ProgramFiles: "C:\\Program Files",
        "ProgramFiles(x86)": "C:\\Program Files (x86)",
      }),
    ).toEqual([
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    ]);
  });
});
