import type { LaunchAction } from "./types";

/** Desktop shell windows. Resizing these would touch the shell, not the app that was launched. */
export const SHELL_WINDOW_CLASSES: ReadonlySet<string> = new Set([
  "Progman",
  "WorkerW",
  "Shell_TrayWnd",
  "Shell_SecondaryTrayWnd",
]);

/** Minimum logical size. Physical pixels from a DPI-aware snapshot are scaled back to this. */
const MIN_PLACE_WIDTH = 160;
const MIN_PLACE_HEIGHT = 120;

/** How long the warm helper polls for the new window after a click. */
export const LAUNCH_WINDOW_WATCH_MS = 4000;

/** How long a click waits for a fresh before-list when the helper is still starting. */
export const LAUNCH_BASELINE_WAIT_MS = 300;

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
  /** Full image path, when the process could be opened. */
  exe: string;
  /** Packaged app id, when the process has one. */
  aumid: string;
  /** Physical pixels from GetWindowRect. Width and height are compared as DIP using `dpi`. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** GetDpiForWindow. 96 means the physical size is already the logical size. */
  dpi: number;
  iconic: boolean;
  /** GetWindow(GW_OWNER) is set. Popups and dialogs owned by another window. */
  owned: boolean;
}

export interface WindowSnapshot {
  foreground: number;
  windows: ObservedWindow[];
}

/** What the tile is trying to open. An existing window must match this or be left alone. */
export interface LaunchTarget {
  exePath?: string;
  exeName?: string;
  aumid?: string;
  /**
   * Store AppsFolder, a shortcut, or an Update.exe-style stub.
   * A new window may belong to a different executable.
   */
  stub?: boolean;
}

export interface PickRequest {
  samples: readonly WindowSnapshot[];
  launcherHwnd: number;
  launcherPid?: number;
  spawnedPid?: number;
  /**
   * Hwnds that existed before the launch.
   * Omit when that snapshot failed: nothing is treated as new.
   */
  baseline?: readonly number[];
  target?: LaunchTarget;
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
  baseline?: readonly number[];
  target?: LaunchTarget;
  /** DIP rect to physical pixels. The helper is per-monitor DPI aware, so it must not be scaled again. */
  toScreenRect?: (rect: WindowRect) => WindowRect;
  /** Undefined when the watch has ended. */
  nextSample: () => Promise<WindowSnapshot | undefined>;
  placeWindow: (hwnd: number, rect: WindowRect) => Promise<boolean>;
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
  const dpi = readInt(value.dpi);
  if (hwnd === undefined || hwnd <= 0 || pid === undefined || pid <= 0) return undefined;
  if (width === undefined || height === undefined || typeof value.className !== "string") return undefined;
  return {
    hwnd,
    pid,
    ancestors: readAncestors(value.ancestors, pid),
    className: value.className,
    title: typeof value.title === "string" ? value.title : "",
    exe: typeof value.exe === "string" ? value.exe : "",
    aumid: typeof value.aumid === "string" ? value.aumid : "",
    x: readInt(value.x) ?? 0,
    y: readInt(value.y) ?? 0,
    width,
    height,
    dpi: dpi !== undefined && dpi >= 96 ? dpi : 96,
    iconic: value.iconic === true,
    owned: value.owned === true,
  };
}

function parseJson(text: string): unknown {
  const trimmed = text.replace(/^\uFEFF/, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start < 0 || end <= start) return undefined;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return undefined;
    }
  }
}

/** Parse one PowerShell snapshot. A broken payload is ignored. */
export function parseWindowSnapshot(text: string): WindowSnapshot | undefined {
  const value = parseJson(text);
  if (!isRecord(value) || !Array.isArray(value.windows)) return undefined;
  const foreground = readInt(value.foreground);
  const windows: ObservedWindow[] = [];
  for (const entry of value.windows) {
    const window = readWindow(entry);
    if (window) windows.push(window);
  }
  return { foreground: foreground && foreground > 0 ? foreground : 0, windows };
}

export function windowBaseName(filePath: string): string {
  const trimmed = filePath.trim().replace(/[\\/]+$/g, "");
  const parts = trimmed.split(/[\\/]/);
  return parts[parts.length - 1] ?? "";
}

function normalizePath(filePath: string): string {
  return filePath.trim().replace(/\//g, "\\").replace(/\\+$/g, "").toLowerCase();
}

/** True when this window is the app the tile asked for. */
export function windowMatchesTarget(window: ObservedWindow, target: LaunchTarget | undefined): boolean {
  if (!target) return false;
  if (target.aumid && window.aumid && window.aumid.toLowerCase() === target.aumid.toLowerCase()) return true;
  if (target.exePath && window.exe && normalizePath(window.exe) === normalizePath(target.exePath)) return true;
  if (target.exeName && window.exe && windowBaseName(window.exe).toLowerCase() === target.exeName.toLowerCase()) {
    return true;
  }
  return false;
}

/** Update.exe, updater.exe, and other stub names that start a different process. */
export function isStubExeName(name: string): boolean {
  return /^(update|updater|launcher)(\.exe)?$/i.test(name) || /update\.exe$/i.test(name);
}

function withStub(target: LaunchTarget, exeName: string | undefined): LaunchTarget {
  if (exeName && isStubExeName(exeName)) return { ...target, stub: true };
  return target;
}

/**
 * The executable or Store id a tile is aiming at.
 * A folder has neither: only a window created by that click is eligible.
 * An unresolved shortcut, an AppsFolder launch, or an Update.exe-style name is a stub.
 * A resolved shortcut uses the target executable, so an updater window is not eligible.
 */
export function targetFromAction(
  action: LaunchAction,
  readShortcut?: (filePath: string) => string | undefined,
): LaunchTarget {
  if (action.type === "openExternal") {
    if (action.url.toLowerCase().startsWith("microsoft-edge:")) return { exeName: "msedge.exe" };
    return {};
  }
  if (action.type === "spawn") {
    const folderArg = action.args.find((arg) => arg.toLowerCase().startsWith("shell:appsfolder\\"));
    if (folderArg) {
      const aumid = folderArg.slice(folderArg.indexOf("\\") + 1).trim();
      return aumid ? { aumid, stub: true } : { stub: true };
    }
    const exeName = windowBaseName(action.command);
    if (/\.exe$/i.test(exeName)) return withStub({ exePath: action.command, exeName }, exeName);
    return {};
  }
  if (/\.lnk$/i.test(action.path)) {
    const resolved = readShortcut?.(action.path);
    if (resolved && /\.exe$/i.test(resolved)) {
      const exeName = windowBaseName(resolved);
      return withStub({ exePath: resolved, exeName }, exeName);
    }
    return { stub: true };
  }
  if (/\.exe$/i.test(action.path)) {
    const exeName = windowBaseName(action.path);
    return withStub({ exePath: action.path, exeName }, exeName);
  }
  return {};
}

function dipExtent(pixels: number, dpi: number): number {
  const scale = dpi >= 96 ? dpi / 96 : 1;
  return pixels / scale;
}

/**
 * A window the launcher is allowed to move.
 * Sizes are physical pixels. The 160 by 120 minimum is in DIP.
 */
export function isPlaceableWindow(
  window: ObservedWindow,
  launcherHwnd: number,
  launcherPid?: number,
): boolean {
  if (window.hwnd === launcherHwnd) return false;
  if (window.owned) return false;
  if (launcherPid !== undefined && window.pid === launcherPid) return false;
  if (!window.className || SHELL_WINDOW_CLASSES.has(window.className)) return false;
  if (!window.iconic) {
    if (dipExtent(window.width, window.dpi) < MIN_PLACE_WIDTH) return false;
    if (dipExtent(window.height, window.dpi) < MIN_PLACE_HEIGHT) return false;
  }
  return true;
}

function belongsToSpawn(window: ObservedWindow, spawnedPid: number): boolean {
  return window.pid === spawnedPid || window.ancestors.includes(spawnedPid);
}

function isNewWindow(window: ObservedWindow, baseline: ReadonlySet<number> | undefined): boolean {
  if (!baseline) return false;
  return !baseline.has(window.hwnd);
}

function hasKnownTarget(target: LaunchTarget | undefined): boolean {
  if (!target) return false;
  return Boolean(target.exePath || target.exeName || target.aumid);
}

/** File Explorer's own window. An old Explorer window is never the one this click opened. */
function isExplorerTarget(target: LaunchTarget | undefined): boolean {
  if (!target || target.stub || target.aumid) return false;
  return target.exeName?.toLowerCase() === "explorer.exe";
}

/**
 * A new window from another exe is only the launched app when we have no exe to match,
 * or the tile is a stub that starts something else.
 */
function allowsDifferentExe(target: LaunchTarget | undefined): boolean {
  if (!hasKnownTarget(target)) return true;
  return target?.stub === true;
}

function exeAgrees(window: ObservedWindow, target: LaunchTarget | undefined): boolean {
  if (allowsDifferentExe(target)) return true;
  if (!window.exe && !window.aumid) return false;
  return windowMatchesTarget(window, target);
}

function newWindowAllowed(
  window: ObservedWindow,
  request: PickRequest,
  baseline: ReadonlySet<number> | undefined,
): boolean {
  if (!isPlaceableWindow(window, request.launcherHwnd, request.launcherPid)) return false;
  if (!isNewWindow(window, baseline)) return false;
  if (request.spawnedPid && request.spawnedPid > 0 && belongsToSpawn(window, request.spawnedPid)) {
    if (allowsDifferentExe(request.target) || !window.exe) return true;
    return windowMatchesTarget(window, request.target);
  }
  return exeAgrees(window, request.target);
}

/**
 * An existing match is moved only when it is the foreground window.
 * explorer.exe never uses this path: only a new Explorer window counts.
 */
function existingMatchReady(request: PickRequest, baseline: ReadonlySet<number> | undefined): boolean {
  if (!baseline || isExplorerTarget(request.target) || !hasKnownTarget(request.target)) return false;
  const sample = request.samples[request.samples.length - 1];
  if (!sample) return false;
  return sample.windows.some(
    (window) =>
      window.hwnd === sample.foreground &&
      isPlaceableWindow(window, request.launcherHwnd, request.launcherPid) &&
      windowMatchesTarget(window, request.target) &&
      !isNewWindow(window, baseline),
  );
}

/** Foreground wins. A single remaining window is used. Several with no foreground is not a guess. */
function chooseOne(matches: readonly ObservedWindow[], foreground: number): ObservedWindow | undefined {
  if (matches.length === 0) return undefined;
  const focused = matches.find((window) => window.hwnd === foreground);
  if (focused) return focused;
  if (matches.length === 1) return matches[0];
  return undefined;
}

/**
 * A new window whose exe agrees with the tile, or an existing match that is
 * the foreground window.
 * A window that was already open and does not match is never moved.
 * explorer.exe is only moved when the window itself is new.
 */
export function pickLaunchedWindow(request: PickRequest): ObservedWindow | undefined {
  const sample = request.samples[request.samples.length - 1];
  if (!sample) return undefined;
  const baseline = request.baseline ? new Set(request.baseline) : undefined;
  const fresh = sample.windows.filter((window) => newWindowAllowed(window, request, baseline));
  const spawnedPid = request.spawnedPid;
  if (spawnedPid && spawnedPid > 0) {
    const byPid = fresh.filter((window) => belongsToSpawn(window, spawnedPid));
    if (byPid.length > 0) return chooseOne(byPid, sample.foreground);
  }
  if (fresh.length > 1 && !fresh.some((window) => window.hwnd === sample.foreground)) return undefined;
  const chosenFresh = chooseOne(fresh, sample.foreground);
  if (chosenFresh) return chosenFresh;
  if (!existingMatchReady(request, baseline)) return undefined;
  const existing = sample.windows.filter(
    (window) =>
      isPlaceableWindow(window, request.launcherHwnd, request.launcherPid) &&
      windowMatchesTarget(window, request.target) &&
      !isNewWindow(window, baseline),
  );
  return chooseOne(existing, sample.foreground);
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

/**
 * Move the launched window. Returns false when nothing qualified or the move failed.
 * A successful place leaves Jarvis full screen behind the app. The caller hides only on false.
 */
export async function centerLaunchedWindow(options: CenterLaunchOptions): Promise<boolean> {
  if (options.platform !== "win32" || options.mode !== "centered") return false;
  if (!Number.isSafeInteger(options.launcherHwnd) || options.launcherHwnd <= 0) return false;
  // No before list means the helper was not ready. Miss without watching.
  if (!options.baseline) return false;
  let target: WindowRect;
  try {
    const dip = centeredWindowRect(options.workArea, options.widthPct, options.heightPct);
    target = roundRect(options.toScreenRect ? options.toScreenRect(dip) : dip);
  } catch {
    return false;
  }
  const baseline = options.baseline;
  const samples: WindowSnapshot[] = [];
  while (true) {
    let snap: WindowSnapshot | undefined;
    try {
      snap = await options.nextSample();
    } catch {
      return false;
    }
    if (!snap) return false;
    samples.push(snap);
    const picked = pickLaunchedWindow({
      samples,
      launcherHwnd: options.launcherHwnd,
      launcherPid: options.launcherPid,
      spawnedPid: options.spawnedPid,
      baseline,
      target: options.target,
    });
    if (!picked || picked.hwnd === options.launcherHwnd) continue;
    try {
      return await options.placeWindow(picked.hwnd, target);
    } catch {
      return false;
    }
  }
}
