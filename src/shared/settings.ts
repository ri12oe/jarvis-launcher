import { parseConfig } from "./config";
import type { JarvisConfig, WeatherConfig } from "./types";

/** What the Settings panel edits. Everything else in config.json is left as it is. */
export interface SettingsValues {
  hotkey: string;
  openAtLogin: boolean;
  startHidden: boolean;
  /** null turns the weather panel off. */
  weather: WeatherConfig | null;
  dock: (string | null)[];
  plates: Record<string, string>;
  dials: { G: string | null; E: string | null };
  leftList: "recent" | "design";
}

export function settingsFromConfig(config: JarvisConfig): SettingsValues {
  return {
    hotkey: config.hotkey,
    openAtLogin: config.openAtLogin,
    startHidden: config.startHidden,
    weather: config.weather ? { ...config.weather } : null,
    dock: [...config.dock],
    plates: { ...config.plates },
    dials: { ...config.dials },
    leftList: config.leftList,
  };
}

function settingsObject(values: SettingsValues): Record<string, unknown> {
  const object: Record<string, unknown> = {
    hotkey: values.hotkey,
    openAtLogin: values.openAtLogin,
    startHidden: values.startHidden,
    dock: values.dock,
    plates: values.plates,
    dials: values.dials,
    leftList: values.leftList,
  };
  if (values.weather) object.weather = values.weather;
  return object;
}

/**
 * Checks the values with the same parser that reads config.json, so the panel
 * cannot save anything the launcher would later reject. Returns the first
 * problem, or null when the values are good.
 */
export function checkSettings(values: unknown): string | null {
  if (!values || typeof values !== "object") return "Settings are missing";
  const record = values as Record<string, unknown>;
  if (typeof record.hotkey !== "string") return "Hotkey is missing";
  if (typeof record.openAtLogin !== "boolean" || typeof record.startHidden !== "boolean") return "Startup options are missing";
  if (!Array.isArray(record.dock)) return "Dock is missing";
  if (!record.plates || typeof record.plates !== "object" || Array.isArray(record.plates)) return "Plates are missing";
  if (!record.dials || typeof record.dials !== "object" || Array.isArray(record.dials)) return "Dials are missing";
  if (record.leftList !== "recent" && record.leftList !== "design") return "Left list choice is missing";
  if (record.weather !== null && (typeof record.weather !== "object" || Array.isArray(record.weather))) {
    return "Weather is not valid";
  }
  const parsed = parseConfig(settingsObject(record as unknown as SettingsValues));
  if (parsed.warnings.length > 0) return parsed.warnings[0];
  if (record.weather && !parsed.config.weather) return "Weather is not valid";
  return null;
}

/**
 * Applies the panel's values to the parsed contents of config.json. Keys the
 * panel does not own (tiles, folders, voice, labels, and any unknown key) keep
 * their values and their order.
 */
export function mergeSettings(raw: Record<string, unknown>, values: SettingsValues): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...raw };
  merged.hotkey = values.hotkey.trim();
  merged.openAtLogin = values.openAtLogin;
  merged.startHidden = values.startHidden;
  merged.dock = values.dock.map((id) => id ?? null);
  merged.plates = { ...values.plates };
  merged.dials = { G: values.dials.G ?? null, E: values.dials.E ?? null };
  merged.leftList = values.leftList;
  if (values.weather) merged.weather = { ...values.weather };
  else delete merged.weather;
  return merged;
}

export interface Place {
  label: string;
  latitude: number;
  longitude: number;
}

export const PLACE_QUERY_LIMIT = 80;

export function geocodeUrl(query: unknown): string | null {
  if (typeof query !== "string") return null;
  const name = query.trim();
  if (name.length < 2 || name.length > PLACE_QUERY_LIMIT) return null;
  const params = new URLSearchParams({ name, count: "5", language: "en", format: "json" });
  return `https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`;
}

/** Open-Meteo geocoding results to "City, Region, CC" places. */
export function parseGeocode(body: unknown): Place[] {
  if (!body || typeof body !== "object") return [];
  const results = (body as Record<string, unknown>).results;
  if (!Array.isArray(results)) return [];
  const places: Place[] = [];
  for (const entry of results) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const { latitude, longitude } = record;
    if (typeof record.name !== "string" || typeof latitude !== "number" || typeof longitude !== "number") continue;
    const parts = [record.name, record.admin1, record.country_code].filter(
      (part): part is string => typeof part === "string" && part.length > 0,
    );
    places.push({
      label: parts.join(", ").slice(0, 80),
      latitude: Math.round(latitude * 100) / 100,
      longitude: Math.round(longitude * 100) / 100,
    });
  }
  return places;
}

const KEY_NAMES: Record<string, string> = {
  " ": "Space",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Escape: "Esc",
  "+": "Plus",
};

/**
 * Turns a key press into an Electron accelerator, for the hotkey box.
 * Returns null while only modifiers are held or for a key the launcher cannot use.
 */
export function acceleratorFromKey(event: {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}): string | null {
  if (["Control", "Alt", "Shift", "Meta", "AltGraph"].includes(event.key)) return null;
  let key = KEY_NAMES[event.key] ?? event.key;
  if (/^[a-z]$/.test(key)) key = key.toUpperCase();
  const valid =
    /^[A-Z0-9]$/.test(key) ||
    /^F([1-9]|1[0-9]|2[0-4])$/.test(key) ||
    ["Space", "Tab", "Backspace", "Delete", "Insert", "Home", "End", "PageUp", "PageDown", "Up", "Down", "Left", "Right", "Esc", "Plus"].includes(key);
  if (!valid) return null;
  const parts: string[] = [];
  if (event.ctrlKey) parts.push("CommandOrControl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (event.metaKey) parts.push("Super");
  if (parts.length === 0) return null;
  return [...parts, key].join("+");
}

/** ipapi.co reply to an approximate place, or null when the lookup failed. */
export function parseIpLocation(body: unknown): Place | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (record.error === true) return null;
  const { latitude, longitude } = record;
  if (typeof latitude !== "number" || typeof longitude !== "number") return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const parts = [record.city, record.region_code ?? record.region, record.country_code].filter(
    (part): part is string => typeof part === "string" && part.length > 0,
  );
  return {
    label: parts.join(", ").slice(0, 80) || "My location",
    latitude: Math.round(latitude * 100) / 100,
    longitude: Math.round(longitude * 100) / 100,
  };
}

export const IP_LOCATION_URL = "https://ipapi.co/json/";
