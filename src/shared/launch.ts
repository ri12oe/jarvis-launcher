import type { BuiltinId, DiscoveredApp, ExtraTile, LaunchAction, PinnedFolder } from "./types";

export interface LaunchEnvironment {
  platform: string;
  /** Existing Microsoft Edge executables, most preferred first. */
  edgeExecutables: readonly string[];
  /** Full path to explorer.exe, usually `%SystemRoot%\explorer.exe`. */
  explorerPath: string;
  folders: Record<"desktop" | "documents" | "downloads" | "pictures", string>;
}

export interface EdgePathEnv {
  ProgramFiles?: string;
  "ProgramFiles(x86)"?: string;
}

const EDGE_PROTOCOL = "microsoft-edge:";

export function windowsExplorerPath(systemRoot?: string): string {
  const root = systemRoot?.trim() ? systemRoot.trim().replace(/[\\/]+$/, "") : "C:\\Windows";
  return `${root}\\explorer.exe`;
}

export function planEdgeLaunch(env: LaunchEnvironment): LaunchAction {
  const exe = env.edgeExecutables.find((candidate) => candidate.trim().length > 0);
  if (exe) return { type: "openPath", path: exe };
  return { type: "openExternal", url: EDGE_PROTOCOL };
}

export function planExplorerLaunch(explorerPath: string): LaunchAction {
  return { type: "spawn", command: explorerPath, args: [] };
}

export function planFolderLaunch(folderPath: string): LaunchAction {
  return { type: "openPath", path: folderPath };
}

export function planDiscoveredLaunch(app: DiscoveredApp, explorerPath: string): LaunchAction {
  if (app.launchKind === "store") {
    return { type: "spawn", command: explorerPath, args: [`shell:AppsFolder\\${app.launchPath}`] };
  }
  return { type: "openPath", path: app.launchPath };
}

export function planExtraLaunch(tile: ExtraTile | PinnedFolder): LaunchAction {
  return { type: "openPath", path: tile.path };
}

export interface LaunchDeps {
  openPath(targetPath: string): Promise<string>;
  openExternal(url: string): Promise<void>;
  spawn(command: string, args: readonly string[]): void | Promise<void>;
}

export interface SpawnedChild {
  once(event: "error", listener: (error: Error) => void): void;
  once(event: "spawn", listener: () => void): void;
  unref(): void;
}

export interface DetachedSpawnOptions {
  detached: true;
  stdio: "ignore";
  windowsHide: boolean;
}

/**
 * Spawn a detached process and surface a missing executable.
 * Without an `error` listener, Node throws after the caller already returned success.
 */
export function spawnDetached(
  command: string,
  args: readonly string[],
  spawnImpl: (command: string, args: string[], options: DetachedSpawnOptions) => SpawnedChild,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let child: SpawnedChild;
    try {
      child = spawnImpl(command, [...args], {
        detached: true,
        stdio: "ignore",
        windowsHide: false,
      });
    } catch (error) {
      reject(error instanceof Error ? error : new Error("Spawn failed"));
      return;
    }
    child.once("error", (error) => reject(error));
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

/** Performs a launch plan. `openPath` returns an error string, empty when it worked. */
export async function runLaunch(action: LaunchAction, deps: LaunchDeps): Promise<void> {
  if (action.type === "openPath") {
    const errorMessage = await deps.openPath(action.path);
    if (errorMessage) throw new Error(errorMessage);
    return;
  }
  if (action.type === "openExternal") {
    await deps.openExternal(action.url);
    return;
  }
  await deps.spawn(action.command, action.args);
}

export function planBuiltinLaunch(builtin: BuiltinId, env: LaunchEnvironment): LaunchAction {
  switch (builtin) {
    case "edge":
      return planEdgeLaunch(env);
    case "explorer":
      return planExplorerLaunch(env.explorerPath);
    case "desktop":
    case "documents":
    case "downloads":
    case "pictures":
      return planFolderLaunch(env.folders[builtin]);
  }
}

/** Known Edge install locations. Existence is checked by the caller. */
export function defaultEdgeCandidates(env: EdgePathEnv = {}): string[] {
  const programFiles = env.ProgramFiles || "C:\\Program Files";
  const programFilesX86 = env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  return [
    `${programFilesX86}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${programFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
  ];
}
