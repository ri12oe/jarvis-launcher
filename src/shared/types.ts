/** Names the matcher looks for. One discovered tile per id. */
export const AI_APP_IDS = [
  "chatgpt",
  "claude",
  "cursor",
  "grok",
  "copilot",
  "perplexity",
  "ollama",
  "lm-studio",
] as const;

export type AiAppId = (typeof AI_APP_IDS)[number];

export const BUILTIN_IDS = [
  "edge",
  "explorer",
  "desktop",
  "documents",
  "downloads",
  "pictures",
] as const;

export type BuiltinId = (typeof BUILTIN_IDS)[number];

export type FolderId = "desktop" | "documents" | "downloads" | "pictures";

export interface ShortcutRecord {
  /** File name without `.lnk`. */
  name: string;
  lnkPath: string;
  /** Resolved shortcut target, when the platform could read it. */
  target?: string;
}

export interface InstalledProgram {
  name: string;
  /** Executable path taken from DisplayIcon. Uninstall strings are never used. */
  exePath?: string;
}

export interface DiscoveredApp {
  id: AiAppId;
  label: string;
  source: "shortcut" | "uninstall";
  /** Present when the app can actually be opened. */
  launchPath: string;
  launchKind: "shortcut" | "exe";
}

export interface PinnedFolder {
  id: string;
  label: string;
  path: string;
}

export interface ExtraTile {
  id: string;
  label: string;
  path: string;
  /** `app` launches a file or shortcut. `folder` opens a directory. Both use openPath. */
  kind: "app" | "folder";
}

export interface JarvisConfig {
  /** Electron accelerator. At least one modifier is required. */
  hotkey: string;
  /** Syncs Electron's login item. Does not edit shell registry keys. */
  openAtLogin: boolean;
  /** When true, the window stays hidden until the hotkey or tray shows it. */
  startHidden: boolean;
  pinnedFolders: PinnedFolder[];
  extraTiles: ExtraTile[];
  /** Tile ids to leave out (a discovered app id, a builtin id, or a custom id). */
  disabled: string[];
  /** Preferred tile id order. Ids not listed keep their default order after these. */
  order: string[];
  /** Optional label overrides keyed by tile id. */
  labels: Record<string, string>;
}

export type TileKind = "app" | "folder" | "system";

export type LaunchAction =
  | { type: "openPath"; path: string }
  | { type: "openExternal"; url: string }
  | { type: "spawn"; command: string; args: string[] };

export interface ResolvedTile {
  id: string;
  label: string;
  kind: TileKind;
  action: LaunchAction;
}

export interface LauncherState {
  hotkey: string;
  platform: string;
  tiles: Array<Pick<ResolvedTile, "id" | "label" | "kind">>;
  warnings: string[];
}

export interface LaunchResult {
  ok: boolean;
  error?: string;
}

export interface JarvisBridge {
  getState(): Promise<LauncherState>;
  launch(tileId: string): Promise<LaunchResult>;
  hide(): void;
  quit(): void;
}
