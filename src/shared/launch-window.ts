/** Desktop shell windows. Resizing these would touch the shell, not the app that was launched. */
export const SHELL_WINDOW_CLASSES: ReadonlySet<string> = new Set([
  "Progman",
  "WorkerW",
  "Shell_TrayWnd",
  "Shell_SecondaryTrayWnd",
]);

const MIN_PLACE_WIDTH = 160;
const MIN_PLACE_HEIGHT = 120;

/** How many snapshots to take before giving up on a window. */
export const LAUNCH_WINDOW_POLL_ATTEMPTS = 6;

/** With a spawned pid, wait this many misses before trusting a new foreground window. */
export const LAUNCH_WINDOW_FOREGROUND_ATTEMPT = 2;

const POLL_GAP_MS = 250;

export interface WindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ObservedWindow {
  hwnd: number;
  pid: number;
  /** Process id chain, own pid first, then parents. */
  ancestors: number[];
  className: string;
  title: string;
  width: number;
  height: number;
  iconic: boolean;
}

export interface WindowSnapshot {
  foreground: number;
  windows: ObservedWindow[];
}

export interface PickRequest {
  samples: readonly WindowSnapshot[];
  launcherHwnd: number;
  launcherPid?: number;
  spawnedPid?: number;
  /** Store apps and Edge often have no new process. Used after a pid match misses. */
  allowForegroundFallback: boolean;
}

export interface CenterLaunchOptions {
  platform: string;
  mode: "centered" | "default";
  widthPct: number;
  heightPct: number;
  workArea: WindowRect;
  launcherHwnd: number;
  launcherPid?: number;
  spawnedPid?: number;
  /** DIP rect to physical pixels. Omitted in tests. */
  toScreenRect?: (rect: WindowRect) => WindowRect;
  listWindows: () => Promise<WindowSnapshot | undefined>;
  placeWindow: (hwnd: number, rect: WindowRect) => Promise<boolean>;
  sleep?: (ms: number) => Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readInt(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) return undefined;
  return value;
}

function readAncestors(value: unknown, pid: number): number[] {
  const ids: number[] = [];
  if (Array.isArray(value)) {
    for (const entry of value) {
      const id = readInt(entry);
      if (id === undefined || id <= 0 || ids.includes(id)) continue;
      ids.push(id);
    }
  }
  if (!ids.includes(pid)) ids.unshift(pid);
  return ids;
}

function readWindow(value: unknown): ObservedWindow | undefined {
  if (!isRecord(value)) return undefined;
  const hwnd = readInt(value.hwnd);
  const pid = readInt(value.pid);
  const width = readInt(value.width);
  const height = readInt(value.height);
  if (hwnd === undefined || hwnd <= 0 || pid === undefined || pid <= 0) return undefined;
  if (width === undefined || height === undefined || typeof value.className !== "string") return undefined;
  return {
    hwnd,
    pid,
    ancestors: readAncestors(value.ancestors, pid),
    className: value.className,
    title: typeof value.title === "string" ? value.title : "",
    width,
    height,
    iconic: value.iconic === true,
  };
}

/** Parse one PowerShell snapshot. A broken payload is ignored. */
export function parseWindowSnapshot(text: string): WindowSnapshot | undefined {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isRecord(value) || !Array.isArray(value.windows)) return undefined;
  const foreground = readInt(value.foreground);
  const windows: ObservedWindow[] = [];
  for (const entry of value.windows) {
    const window = readWindow(entry);
    if (window) windows.push(window);
  }
  return { foreground: foreground && foreground > 0 ? foreground : 0, windows };
}

/**
 * A window the launcher is allowed to move.
 * The shell classes stay out even when they are the foreground window.
 */
export function isPlaceableWindow(
  window: ObservedWindow,
  launcherHwnd: number,
  launcherPid?: number,
): boolean {
  if (window.hwnd === launcherHwnd) return false;
  if (launcherPid !== undefined && window.pid === launcherPid) return false;
  if (!window.className || SHELL_WINDOW_CLASSES.has(window.className)) return false;
  if (!window.iconic && (window.width < MIN_PLACE_WIDTH || window.height < MIN_PLACE_HEIGHT)) return false;
  return true;
}

function belongsToSpawn(window: ObservedWindow, spawnedPid: number): boolean {
  return window.pid === spawnedPid || window.ancestors.includes(spawnedPid);
}

function pickByPid(samples: readonly WindowSnapshot[], request: PickRequest): ObservedWindow | undefined {
  const spawnedPid = request.spawnedPid;
  if (spawnedPid === undefined || spawnedPid <= 0) return undefined;
  for (let index = samples.length - 1; index >= 0; index--) {
    const sample = samples[index];
    const matches = sample.windows.filter(
      (window) =>
        isPlaceableWindow(window, request.launcherHwnd, request.launcherPid) &&
        belongsToSpawn(window, spawnedPid),
    );
    if (matches.length === 0) continue;
    return matches.find((window) => window.hwnd === sample.foreground) ?? matches[0];
  }
  return undefined;
}

function pickByForeground(samples: readonly WindowSnapshot[], request: PickRequest): ObservedWindow | undefined {
  for (let index = samples.length - 1; index >= 0; index--) {
    const sample = samples[index];
    if (!sample.foreground || sample.foreground === request.launcherHwnd) continue;
    const found = sample.windows.find(
      (window) =>
        window.hwnd === sample.foreground &&
        isPlaceableWindow(window, request.launcherHwnd, request.launcherPid),
    );
    if (found) return found;
  }
  return undefined;
}

/**
 * Prefer a top-level window owned by the spawned process (or one of its parents).
 * Otherwise the foreground window that showed up and is not the launcher.
 */
export function pickLaunchedWindow(request: PickRequest): ObservedWindow | undefined {
  const byPid = pickByPid(request.samples, request);
  if (byPid) return byPid;
  if (!request.allowForegroundFallback) return undefined;
  return pickByForeground(request.samples, request);
}

function sized(available: number, pct: number): number {
  if (!Number.isFinite(available) || available <= 0) return 1;
  const ratio = Number.isFinite(pct) ? pct : 70;
  const raw = Math.round((available * ratio) / 100);
  if (raw < 1) return 1;
  if (raw > available) return available;
  return raw;
}

/**
 * Center a window inside a display work area.
 * `workArea.x` and `workArea.y` are the display origin, which is not zero on a second monitor.
 */
export function centeredWindowRect(workArea: WindowRect, widthPct: number, heightPct: number): WindowRect {
  const width = sized(workArea.width, widthPct);
  const height = sized(workArea.height, heightPct);
  let x = workArea.x + Math.round((workArea.width - width) / 2);
  let y = workArea.y + Math.round((workArea.height - height) / 2);
  const right = workArea.x + workArea.width;
  const bottom = workArea.y + workArea.height;
  if (x < workArea.x) x = workArea.x;
  if (y < workArea.y) y = workArea.y;
  if (x + width > right) x = right - width;
  if (y + height > bottom) y = bottom - height;
  return { x, y, width, height };
}

function roundRect(rect: WindowRect): WindowRect {
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Find the new window and move it. Returns false when there is nothing to move.
 * Failures stay quiet: the app has already launched.
 */
export async function centerLaunchedWindow(options: CenterLaunchOptions): Promise<boolean> {
  if (options.platform !== "win32" || options.mode !== "centered") return false;
  if (!Number.isSafeInteger(options.launcherHwnd) || options.launcherHwnd <= 0) return false;
  let target: WindowRect;
  try {
    const dip = centeredWindowRect(options.workArea, options.widthPct, options.heightPct);
    target = roundRect(options.toScreenRect ? options.toScreenRect(dip) : dip);
  } catch {
    return false;
  }
  const samples: WindowSnapshot[] = [];
  const sleep = options.sleep ?? delay;
  const spawnedPid = options.spawnedPid !== undefined && options.spawnedPid > 0 ? options.spawnedPid : undefined;
  for (let attempt = 0; attempt < LAUNCH_WINDOW_POLL_ATTEMPTS; attempt++) {
    try {
      const snap = await options.listWindows();
      if (snap) samples.push(snap);
    } catch {
      // The next poll is the retry. A dead snapshot is not a launch failure.
    }
    const picked = pickLaunchedWindow({
      samples,
      launcherHwnd: options.launcherHwnd,
      launcherPid: options.launcherPid,
      spawnedPid,
      allowForegroundFallback: spawnedPid === undefined || attempt >= LAUNCH_WINDOW_FOREGROUND_ATTEMPT,
    });
    if (picked && picked.hwnd !== options.launcherHwnd) {
      try {
        return await options.placeWindow(picked.hwnd, target);
      } catch {
        return false;
      }
    }
    if (attempt < LAUNCH_WINDOW_POLL_ATTEMPTS - 1) await sleep(POLL_GAP_MS);
  }
  return false;
}
