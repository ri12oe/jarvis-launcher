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
  "gemini",
  "vscode",
  "word",
  "spotify",
  "outlook",
  "github",
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

/** Web fallbacks for HUD slots whose desktop app is not installed. */
export const WEB_TILE_IDS = ["gemini-web", "github-web", "x"] as const;

export type WebTileId = (typeof WEB_TILE_IDS)[number];

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
  source: "shortcut" | "store" | "uninstall";
  /** Shortcut path, exe path, or packaged app id. */
  launchPath: string;
  launchKind: "shortcut" | "exe" | "store";
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

export type VoicePhase = "idle" | "listening" | "thinking" | "speaking";

/**
 * Voice settings from config.json. The API key is never stored here.
 * `enabled` omitted means on when the main process can read a key.
 */
export interface VoiceConfig {
  enabled?: boolean;
  /** Name of the environment variable that holds the xAI key. */
  apiKeyEnv: string;
  /** Model id for POST /v1/chat/completions. */
  model: string;
  /** Voice id for POST /v1/tts. */
  voiceId: string;
  /** Model id for POST /v1/stt. */
  sttModel: string;
}

/** Renderer view of voice. It never includes the API key. */
export interface VoiceSnapshot {
  hasKey: boolean;
  enabled: boolean;
  /** Open the microphone and stream PCM to the main process. */
  capture: boolean;
  phase: VoicePhase;
  heard: string;
  reply: string;
  /** Empty, or a short reason safe to show in the footer. */
  error: string;
  /** Empty, or a launch failure from a spoken open command. */
  launchError: string;
}

export type LaunchWindowMode = "centered" | "default";

/** How a launched app's top-level window is placed on Windows. */
export interface LaunchWindowConfig {
  /** `centered` resizes the new window. `default` leaves the app's own size. */
  mode: LaunchWindowMode;
  /** Percent of the work area on the display Jarvis is using. 10 to 100. */
  widthPct: number;
  heightPct: number;
}

export interface JarvisConfig {
  /** Electron accelerator. At least one modifier is required. */
  hotkey: string;
  /** Syncs Electron's login item. Does not edit shell registry keys. */
  openAtLogin: boolean;
  /** When true, the window stays hidden until the hotkey or tray shows it. */
  startHidden: boolean;
  /** Windows only. Other platforms launch the app and leave its window alone. */
  launchWindow: LaunchWindowConfig;
  pinnedFolders: PinnedFolder[];
  extraTiles: ExtraTile[];
  /** Tile ids to leave out (a discovered app id, a builtin id, or a custom id). */
  disabled: string[];
  /** Preferred tile id order. Ids not listed keep their default order after these. */
  order: string[];
  /** Optional label overrides keyed by tile id. */
  labels: Record<string, string>;
  voice: VoiceConfig;
  /** Optional. Weather stays "--" until a location is set. */
  weather?: WeatherConfig;
}

export interface WeatherConfig {
  latitude: number;
  longitude: number;
  /** Shown above the temperature, for example "Indianapolis, IN". */
  label: string;
  units: "fahrenheit" | "celsius";
}

export interface WeatherDay {
  /** Local date, YYYY-MM-DD. */
  date: string;
  high: number;
  low: number;
  condition: string;
}

export interface WeatherReport {
  label: string;
  units: "F" | "C";
  /** ISO time of the reading. */
  updated: string;
  temperature: number;
  condition: string;
  humidity: number;
  feelsLike: number;
  precipitation: number;
  visibilityKm: number;
  windSpeed: number;
  windUnit: string;
  pressureHpa: number;
  sunrise: string;
  sunset: string;
  uvIndex: number;
  days: WeatherDay[];
}

/** Live readings for the HUD. Any field is null when this PC cannot report it. */
export interface SystemStats {
  cpuPct: number | null;
  ramUsedBytes: number;
  ramFreeBytes: number;
  ramTotalBytes: number;
  diskPct: number | null;
  uptimeSec: number;
  wifi: { signalPct: number; ssid: string } | null;
  net: { downBytesPerSec: number; upBytesPerSec: number } | null;
  recycle: { items: number; bytes: number } | null;
  weather: WeatherReport | null;
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

export interface LauncherTileView {
  id: string;
  label: string;
  kind: TileKind;
  /** `app.getFileIcon` as a data URL, when the platform could read one. */
  icon?: string;
}

export interface LauncherState {
  hotkey: string;
  platform: string;
  tiles: LauncherTileView[];
  warnings: string[];
  /** True from startup until the current discovery pass publishes a list. */
  scanning: boolean;
  /** True after a refresh throws. Cleared when the next pass starts. */
  refreshFailed: boolean;
}

export interface LaunchResult {
  ok: boolean;
  error?: string;
}

export interface JarvisBridge {
  getState(): Promise<LauncherState>;
  onState(listener: (state: LauncherState) => void): () => void;
  launch(tileId: string): Promise<LaunchResult>;
  /** Reloads config, discovery, and icons. The same work as the tray Refresh item. */
  refresh(): Promise<void>;
  /** Fired when the window hides, including from the global hotkey. */
  onHidden(listener: () => void): () => void;
  hide(): void;
  quit(): void;
  getVoice(): Promise<VoiceSnapshot>;
  onVoice(listener: (voice: VoiceSnapshot) => void): () => void;
  setVoiceEnabled(enabled: boolean): Promise<void>;
  /** 16 kHz mono PCM16 captured after the mic is open. Stays on this machine until the wake word. */
  pushAudio(pcm: ArrayBuffer): void;
  onSpeak(listener: (audio: ArrayBuffer, contentType: string) => void): () => void;
  playbackEnded(): void;
  reportVoiceError(message: string): void;
  getStats(): Promise<SystemStats>;
}
