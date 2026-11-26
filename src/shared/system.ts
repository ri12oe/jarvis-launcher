/**
 * Power, media, volume, brightness and web search: the parts of the HUD that
 * act on Windows. Everything here is pure so it can be tested off Windows.
 */

export const POWER_ACTIONS = [
  "sleep",
  "restart",
  "shutdown",
  "signout",
  "lock",
] as const;
export type PowerAction = (typeof POWER_ACTIONS)[number];

export const SYSTEM_ACTIONS = [
  ...POWER_ACTIONS,
  "media-prev",
  "media-toggle",
  "media-next",
  "media-seek",
  "volume-set",
  "volume-step",
  "mute-toggle",
  "mic-toggle",
  "brightness-set",
  "open-taskmgr",
  "open-recyclebin",
  "empty-recyclebin",
  "open-calendar",
] as const;
export type SystemAction = (typeof SYSTEM_ACTIONS)[number];

/** Real names for the five design buttons, left to right. */
export const POWER_BUTTONS: readonly { action: PowerAction; name: string }[] = [
  { action: "sleep", name: "Sleep" },
  { action: "restart", name: "Restart" },
  { action: "shutdown", name: "Shut down" },
  { action: "signout", name: "Sign out" },
  { action: "lock", name: "Lock" },
];

/** Actions that can lose work or files, so they need a second click. */
export type ConfirmAction = PowerAction | "empty-recyclebin";
export const CONFIRM_ACTIONS: ReadonlySet<ConfirmAction> =
  new Set<ConfirmAction>([
    "shutdown",
    "restart",
    "signout",
    "empty-recyclebin",
  ]);
export const CONFIRM_WINDOW_MS = 5000;

export interface PendingPower {
  action: ConfirmAction;
  until: number;
}

/**
 * First click on Shut down, Restart or Sign out arms it for five seconds.
 * A second click on the same button inside that time runs it. Any other
 * power button runs at once and clears what was armed.
 */
export function powerClick(
  pending: PendingPower | null,
  action: ConfirmAction,
  now: number,
): { run: boolean; pending: PendingPower | null } {
  if (!CONFIRM_ACTIONS.has(action)) return { run: true, pending: null };
  if (pending && pending.action === action && now <= pending.until)
    return { run: true, pending: null };
  return { run: false, pending: { action, until: now + CONFIRM_WINDOW_MS } };
}

export function confirmText(action: ConfirmAction): string {
  if (action === "empty-recyclebin")
    return "EMPTY RECYCLE BIN?  RIGHT-CLICK AGAIN TO CONFIRM";
  const name =
    POWER_BUTTONS.find((button) => button.action === action)?.name ?? action;
  return `${name.toUpperCase()}?  CLICK AGAIN TO CONFIRM`;
}

/** Checks an action from the renderer. Returns the clamped value, or null when the request is not allowed. */
export function checkSystemAction(
  action: unknown,
  value: unknown,
): { action: SystemAction; value: number } | null {
  if (
    typeof action !== "string" ||
    !(SYSTEM_ACTIONS as readonly string[]).includes(action)
  )
    return null;
  const known = action as SystemAction;
  const needsValue =
    known === "volume-set" ||
    known === "volume-step" ||
    known === "brightness-set" ||
    known === "media-seek";
  if (!needsValue) return { action: known, value: 0 };
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (known === "volume-step")
    return {
      action: known,
      value: Math.round(Math.max(-100, Math.min(100, value))),
    };
  if (known === "media-seek")
    return { action: known, value: Math.max(0, Math.min(86_400, value)) };
  return {
    action: known,
    value: Math.round(Math.max(0, Math.min(100, value))),
  };
}

export type PlaybackStatus = "playing" | "paused" | "stopped";

export interface MediaState {
  title: string;
  artist: string;
  /** App id of the player, for example Spotify.exe or MSEdge. */
  app: string;
  status: PlaybackStatus;
  /** Seconds at `updatedMs`. */
  position: number;
  /** Seconds. 0 when the player does not report a length. */
  duration: number;
  /** Epoch milliseconds when `position` was read. */
  updatedMs: number;
}

export interface SystemState {
  /** 0 to 100, or null when Windows reports no playback device. */
  volume: number | null;
  muted: boolean | null;
  micMuted: boolean | null;
  /** 0 to 100, or null on a monitor that does not take brightness over WMI (most desktops). */
  brightness: number | null;
  media: MediaState | null;
}

export const EMPTY_SYSTEM: SystemState = {
  volume: null,
  muted: null,
  micMuted: null,
  brightness: null,
  media: null,
};

function percent(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    return null;
  return Math.round(Math.min(100, value));
}

function flag(value: unknown): boolean | null {
  if (value === 1 || value === true) return true;
  if (value === 0 || value === false) return false;
  return null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.slice(0, 200) : "";
}

function status(value: unknown): PlaybackStatus {
  if (value === "Playing") return "playing";
  if (value === "Paused") return "paused";
  return "stopped";
}

function seconds(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

/** The `state` reply from the PowerShell helper. Anything malformed becomes null. */
export function parseSystemState(data: unknown): SystemState {
  if (!data || typeof data !== "object") return EMPTY_SYSTEM;
  const record = data as Record<string, unknown>;
  const media =
    record.media && typeof record.media === "object"
      ? (record.media as Record<string, unknown>)
      : null;
  return {
    volume: percent(record.volume),
    muted: flag(record.muted),
    micMuted: flag(record.mic),
    brightness: percent(record.brightness),
    media:
      media && (text(media.title) || text(media.artist))
        ? {
            title: text(media.title),
            artist: text(media.artist),
            app: text(media.app),
            status: status(media.status),
            position: seconds(media.position),
            duration: seconds(media.duration),
            updatedMs:
              typeof media.updated === "number" &&
              Number.isFinite(media.updated)
                ? media.updated
                : 0,
          }
        : null,
  };
}

/** Position right now, moving forward while playing, never past the end. */
export function mediaPosition(media: MediaState, nowMs: number): number {
  let position = media.position;
  if (media.status === "playing" && media.updatedMs > 0)
    position += Math.max(0, (nowMs - media.updatedMs) / 1000);
  return media.duration > 0 ? Math.min(position, media.duration) : position;
}

/** `0:00`, `3:07`, `1:02:09` */
export function formatTrackTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const secs = String(s % 60).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${secs}`
    : `${minutes}:${secs}`;
}

export const SEARCH_LIMIT = 300;

/** Google search URL, or null for an empty or too-long query. Built in the main process only. */
export function webSearchUrl(query: unknown): string | null {
  if (typeof query !== "string") return null;
  const trimmed = query.trim();
  if (!trimmed || trimmed.length > SEARCH_LIMIT) return null;
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

/** Helper reply line: `{"id":3,"ok":true,"data":...}`. */
export function parseHelperReply(
  line: string,
): { id: number; ok: boolean; data: unknown } | null {
  try {
    const value = JSON.parse(line) as Record<string, unknown>;
    if (typeof value.id !== "number" || typeof value.ok !== "boolean")
      return null;
    return { id: value.id, ok: value.ok, data: value.data };
  } catch {
    return null;
  }
}
