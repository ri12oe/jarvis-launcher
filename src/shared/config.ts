import type { ExtraTile, JarvisConfig, LaunchWindowConfig, PinnedFolder, VoiceConfig, WeatherConfig } from "./types";
import { AI_APP_IDS, BUILTIN_IDS, WEB_TILE_IDS } from "./types";

export const DEFAULT_HOTKEY = "CommandOrControl+Alt+J";

export const DEFAULT_LAUNCH_WINDOW: LaunchWindowConfig = {
  mode: "centered",
  widthPct: 70,
  heightPct: 70,
};

/** Current Grok chat model from the xAI chat-completions guide. */
export const DEFAULT_CHAT_MODEL = "grok-4.7";

/** Default speech-to-text model. xAI uses this when `model` is omitted. */
export const DEFAULT_STT_MODEL = "grok-voice-transcribe-2.0";

/** Built-in TTS voice. `eve` is the voice the xAI text-to-speech examples use. */
export const DEFAULT_VOICE_ID = "eve";

export const DEFAULT_API_KEY_ENV = "XAI_API_KEY";

export const DEFAULT_VOICE: VoiceConfig = {
  apiKeyEnv: DEFAULT_API_KEY_ENV,
  model: DEFAULT_CHAT_MODEL,
  voiceId: DEFAULT_VOICE_ID,
  sttModel: DEFAULT_STT_MODEL,
};

export const DEFAULT_CONFIG: JarvisConfig = {
  hotkey: DEFAULT_HOTKEY,
  openAtLogin: false,
  startHidden: false,
  launchWindow: { ...DEFAULT_LAUNCH_WINDOW },
  pinnedFolders: [],
  extraTiles: [],
  disabled: [],
  order: [],
  labels: {},
  voice: { ...DEFAULT_VOICE },
};

const RESERVED_IDS = new Set<string>([...AI_APP_IDS, ...BUILTIN_IDS, ...WEB_TILE_IDS]);

const MODIFIER =
  "CommandOrControl|Command|Cmd|Control|Ctrl|Alt|Option|AltGr|Shift|Super|Meta";
const KEY = "[A-Za-z0-9]|F([1-9]|1[0-9]|2[0-4])|Plus|Space|Tab|Backspace|Delete|Insert|Home|End|PageUp|PageDown|Up|Down|Left|Right|Esc|Escape";

/** Electron accelerator with at least one modifier and a final key. */
const HOTKEY_PATTERN = new RegExp(`^(?:(?:${MODIFIER})\\+)+(?:${KEY})$`);

export function isValidHotkey(value: string): boolean {
  const trimmed = value.trim();
  if (!HOTKEY_PATTERN.test(trimmed)) return false;
  const modifiers = trimmed.split("+").slice(0, -1);
  return modifiers.some((part) => part !== "Shift");
}

export function cloneDefaultConfig(): JarvisConfig {
  return {
    hotkey: DEFAULT_CONFIG.hotkey,
    openAtLogin: DEFAULT_CONFIG.openAtLogin,
    startHidden: DEFAULT_CONFIG.startHidden,
    launchWindow: { ...DEFAULT_LAUNCH_WINDOW },
    pinnedFolders: [],
    extraTiles: [],
    disabled: [],
    order: [],
    labels: {},
    voice: { ...DEFAULT_VOICE },
  };
}

/**
 * Absolute Windows (drive or UNC) or POSIX path.
 * The launcher only opens these; it never writes them.
 */
export function isAbsolutePath(value: string): boolean {
  if (value.includes("\0") || value.trim() !== value || value.length === 0) return false;
  if (/^[A-Za-z]:[\\/]/.test(value)) return true;
  if (value.startsWith("\\\\") && value.length > 2) return true;
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readPercent(value: unknown, warnings: string[], label: string): number {
  if (value === undefined) return 70;
  if (typeof value === "number" && Number.isFinite(value) && value >= 10 && value <= 100) {
    return Math.round(value);
  }
  warnings.push(`${label} must be a number from 10 to 100; using 70`);
  return 70;
}

function readLaunchWindow(value: unknown, warnings: string[]): LaunchWindowConfig {
  if (value === undefined) return { ...DEFAULT_LAUNCH_WINDOW };
  if (!isRecord(value)) {
    warnings.push("launchWindow must be an object; using the centered default");
    return { ...DEFAULT_LAUNCH_WINDOW };
  }
  let mode = DEFAULT_LAUNCH_WINDOW.mode;
  if (value.mode !== undefined) {
    if (value.mode === "centered" || value.mode === "default") mode = value.mode;
    else warnings.push('launchWindow.mode must be "centered" or "default"; using centered');
  }
  return {
    mode,
    widthPct: readPercent(value.widthPct, warnings, "launchWindow.widthPct"),
    heightPct: readPercent(value.heightPct, warnings, "launchWindow.heightPct"),
  };
}

function readBoolean(value: unknown, fallback: boolean, warnings: string[], label: string): boolean {
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  warnings.push(`${label} must be a boolean; using ${fallback}`);
  return fallback;
}

function readId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const id = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(id)) return undefined;
  return id;
}

function readLabel(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const label = value.trim();
  if (label.length === 0 || label.length > 80) return undefined;
  return label;
}

function readPath(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (!isAbsolutePath(value)) return undefined;
  return value;
}

function readPinned(value: unknown, warnings: string[], seen: Set<string>): PinnedFolder | undefined {
  if (!isRecord(value)) {
    warnings.push("Skipped a pinned folder that is not an object");
    return undefined;
  }
  const id = readId(value.id);
  const label = readLabel(value.label);
  const folderPath = readPath(value.path);
  if (!id || !label || !folderPath) {
    warnings.push("Skipped a pinned folder with a missing id, label, or absolute path");
    return undefined;
  }
  if (RESERVED_IDS.has(id)) {
    warnings.push(`"${id}" is reserved; skipped that pinned folder`);
    return undefined;
  }
  if (seen.has(id)) {
    warnings.push(`Skipped duplicate id "${id}"`);
    return undefined;
  }
  seen.add(id);
  return { id, label, path: folderPath };
}

function readExtra(value: unknown, warnings: string[], seen: Set<string>): ExtraTile | undefined {
  if (!isRecord(value)) {
    warnings.push("Skipped an extra tile that is not an object");
    return undefined;
  }
  const id = readId(value.id);
  const label = readLabel(value.label);
  const tilePath = readPath(value.path);
  const kind = value.kind === "app" || value.kind === "folder" ? value.kind : undefined;
  if (!id || !label || !tilePath || !kind) {
    warnings.push("Skipped an extra tile with a missing id, label, kind, or absolute path");
    return undefined;
  }
  if (RESERVED_IDS.has(id)) {
    warnings.push(`"${id}" is reserved; skipped that extra tile`);
    return undefined;
  }
  if (seen.has(id)) {
    warnings.push(`Skipped duplicate id "${id}"`);
    return undefined;
  }
  seen.add(id);
  return { id, label, path: tilePath, kind };
}

function readIdList(value: unknown, warnings: string[], label: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    warnings.push(`${label} must be an array of ids; ignoring it`);
    return [];
  }
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const id = readId(entry);
    if (!id) {
      warnings.push(`Skipped an invalid id in ${label}`);
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function readLabels(value: unknown, warnings: string[]): Record<string, string> {
  if (value === undefined) return {};
  if (!isRecord(value)) {
    warnings.push("labels must be an object of id -> label; ignoring it");
    return {};
  }
  const labels: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    const id = readId(key);
    const label = readLabel(entry);
    if (!id || !label) {
      warnings.push(`Skipped label override for "${key}"`);
      continue;
    }
    labels[id] = label;
  }
  return labels;
}

export interface ParsedConfig {
  config: JarvisConfig;
  warnings: string[];
}

/**
 * Validate untrusted JSON. Invalid fields are dropped and defaults fill the gaps.
 * This never throws.
 */
export function parseConfig(input: unknown): ParsedConfig {
  const warnings: string[] = [];
  if (!isRecord(input)) {
    warnings.push("Config must be a JSON object; using defaults");
    return { config: cloneDefaultConfig(), warnings };
  }

  let hotkey = DEFAULT_HOTKEY;
  if (input.hotkey !== undefined) {
    if (typeof input.hotkey === "string" && isValidHotkey(input.hotkey)) {
      hotkey = input.hotkey.trim();
    } else {
      warnings.push(`Invalid hotkey; using ${DEFAULT_HOTKEY}`);
    }
  }

  const seen = new Set<string>();
  const pinnedFolders: PinnedFolder[] = [];
  if (input.pinnedFolders !== undefined) {
    if (!Array.isArray(input.pinnedFolders)) {
      warnings.push("pinnedFolders must be an array; ignoring it");
    } else {
      for (const entry of input.pinnedFolders) {
        const folder = readPinned(entry, warnings, seen);
        if (folder) pinnedFolders.push(folder);
      }
    }
  }

  const extraTiles: ExtraTile[] = [];
  if (input.extraTiles !== undefined) {
    if (!Array.isArray(input.extraTiles)) {
      warnings.push("extraTiles must be an array; ignoring it");
    } else {
      for (const entry of input.extraTiles) {
        const tile = readExtra(entry, warnings, seen);
        if (tile) extraTiles.push(tile);
      }
    }
  }

  const config: JarvisConfig = {
    hotkey,
    openAtLogin: readBoolean(input.openAtLogin, false, warnings, "openAtLogin"),
    startHidden: readBoolean(input.startHidden, false, warnings, "startHidden"),
    launchWindow: readLaunchWindow(input.launchWindow, warnings),
    pinnedFolders,
    extraTiles,
    disabled: readIdList(input.disabled, warnings, "disabled"),
    order: readIdList(input.order, warnings, "order"),
    labels: readLabels(input.labels, warnings),
    voice: readVoice(input.voice, warnings),
  };
  if (input.weather !== undefined) {
    const weather = readWeather(input.weather, warnings);
    if (weather) config.weather = weather;
  }
  return { config, warnings };
}

function readWeather(value: unknown, warnings: string[]): WeatherConfig | undefined {
  if (!isRecord(value)) {
    warnings.push("weather must be an object; ignoring it");
    return undefined;
  }
  const { latitude, longitude } = value;
  if (typeof latitude !== "number" || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    warnings.push("weather.latitude must be a number from -90 to 90; ignoring weather");
    return undefined;
  }
  if (typeof longitude !== "number" || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    warnings.push("weather.longitude must be a number from -180 to 180; ignoring weather");
    return undefined;
  }
  let units: WeatherConfig["units"] = "fahrenheit";
  if (value.units !== undefined) {
    if (value.units === "fahrenheit" || value.units === "celsius") units = value.units;
    else warnings.push('weather.units must be "fahrenheit" or "celsius"; using fahrenheit');
  }
  const label = readLabel(value.label) ?? "";
  if (value.label !== undefined && !label) warnings.push("weather.label must be 1 to 80 characters; leaving it blank");
  return { latitude, longitude, label, units };
}

const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** Only the xAI key variable, or another variable whose name starts with XAI_. */
export function isAllowedKeyEnv(name: string): boolean {
  return /^XAI_[A-Za-z0-9_]+$/.test(name);
}

function readToken(value: unknown, fallback: string, warnings: string[], label: string, pattern: RegExp): string {
  if (value === undefined) return fallback;
  if (typeof value === "string" && pattern.test(value.trim())) return value.trim();
  warnings.push(`${label} is invalid; using ${fallback}`);
  return fallback;
}

function readKeyEnv(value: unknown, warnings: string[]): string {
  if (value === undefined) return DEFAULT_API_KEY_ENV;
  if (typeof value === "string" && isAllowedKeyEnv(value.trim())) return value.trim();
  warnings.push(`voice.apiKeyEnv must be XAI_API_KEY or start with XAI_; using ${DEFAULT_API_KEY_ENV}`);
  return DEFAULT_API_KEY_ENV;
}

function readVoice(value: unknown, warnings: string[]): VoiceConfig {
  if (value === undefined) return { ...DEFAULT_VOICE };
  if (!isRecord(value)) {
    warnings.push("voice must be an object; using defaults");
    return { ...DEFAULT_VOICE };
  }
  const voice: VoiceConfig = {
    apiKeyEnv: readKeyEnv(value.apiKeyEnv, warnings),
    model: readToken(value.model, DEFAULT_VOICE.model, warnings, "voice.model", TOKEN),
    voiceId: readToken(value.voiceId, DEFAULT_VOICE.voiceId, warnings, "voice.voiceId", TOKEN).toLowerCase(),
    sttModel: readToken(value.sttModel, DEFAULT_VOICE.sttModel, warnings, "voice.sttModel", TOKEN),
  };
  if (value.enabled !== undefined) {
    if (typeof value.enabled === "boolean") voice.enabled = value.enabled;
    else warnings.push("voice.enabled must be a boolean; leaving it unset");
  }
  return voice;
}

/**
 * Set `voice.enabled` in a config file's text.
 * Returns undefined when the file is not a JSON object, so a broken file is left alone.
 */
export function patchVoiceEnabledText(text: string, enabled: boolean): string | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
  if (!isRecord(raw)) return undefined;
  const voice = isRecord(raw.voice) ? { ...raw.voice } : {};
  voice.enabled = enabled;
  raw.voice = voice;
  return `${JSON.stringify(raw, null, 2)}\n`;
}

/** The key lives in the environment. Blank values count as missing. The value is not logged. */
export function readVoiceApiKey(env: { readonly [name: string]: string | undefined }, name: string): string | undefined {
  const value = env[name];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * The mic toggle. An omitted `enabled` is on when a key is present and off when it is not.
 * An explicit true stays true even if the key is missing; the footer then says NO KEY.
 */
export function voicePreferenceOn(voice: VoiceConfig, hasKey: boolean): boolean {
  if (voice.enabled === false) return false;
  if (voice.enabled === true) return true;
  return hasKey;
}

export function parseConfigText(text: string): ParsedConfig {
  try {
    return parseConfig(JSON.parse(text) as unknown);
  } catch {
    return {
      config: cloneDefaultConfig(),
      warnings: ["Config is not valid JSON; using defaults"],
    };
  }
}

export function serializeConfig(config: JarvisConfig): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}
