import { execFile, spawn as spawnProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  session,
  shell,
  Tray,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from "electron";
import { loadConfig } from "../config/load";
import { discoverInstalledApps } from "../discovery";
import { patchVoiceEnabledText, DEFAULT_HOTKEY } from "../shared/config";
import { allowMediaPermission } from "../shared/media-permission";
import { hotkeyRegistrationWarnings } from "../shared/hotkey";
import { tileFallbackIcon, tileIconFile } from "../shared/icons";
import {
  defaultEdgeCandidates,
  runLaunch,
  spawnDetached,
  windowsExplorerPath,
} from "../shared/launch";
import {
  centeredWindowRect,
  centerLaunchedWindow,
  LAUNCH_BASELINE_WAIT_MS,
  LAUNCH_WINDOW_WATCH_MS,
  targetFromAction,
} from "../shared/launch-window";
import { loginItemOptions } from "../shared/login-item";
import { createRefreshGate, isMainFrameSender } from "../shared/refresh";
import { composeTiles } from "../shared/tiles";
import type {
  DiscoveredApp,
  JarvisConfig,
  LauncherState,
  LauncherTileView,
  LaunchResult,
  ResolvedTile,
  VoiceSnapshot,
} from "../shared/types";
import { resolveHudSlots } from "../shared/mario";
import {
  pickRecent,
  type RecentItem,
  type RecentShortcut,
} from "../shared/recent";
import {
  checkSettings,
  geocodeUrl,
  IP_LOCATION_URL,
  parseIpLocation,
  mergeSettings,
  parseGeocode,
  settingsFromConfig,
  type SettingsValues,
} from "../shared/settings";
import {
  calendarShortcut,
  checkSystemAction,
  POWER_ACTIONS,
  webSearchUrl,
} from "../shared/system";
import { StatsService } from "./stats";
import { SystemControls } from "./system-controls";
import { createVoiceSession, type VoiceSession } from "./voice-session";
import { WindowsSpeech } from "./windows-speech";
import {
  DEFAULT_GREETING,
  greetingLine,
  localDay,
  shouldGreet,
} from "../shared/greeting";
import { WindowsInput } from "./windows-input";
import { CliPipe } from "./cli-pipe";
import { DeepAgent } from "./deep-agent";
import { PreviewServer } from "./preview-server";
import { previewUrlPath } from "../shared/preview";
import { DEFAULT_DEEP } from "../shared/deep";
import { edgeUrl } from "../shared/computer";
import { ComputerTask, type ComputerHost } from "./computer";
import { readStartApps } from "../discovery/start-apps";
import { matchTile } from "../shared/voice-command";
import { isLaunchableAppId, type StoreApp } from "../shared/start-apps";
import { resolveWakeDir } from "./wakeword";
import { createWindowSession, type WindowWatch } from "./window-snapshot";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let trayReady = false;
let quitting = false;
let activeHotkey = "";
let appliedHotkeyRequest = "";
let appliedLogin: boolean | null = null;
let hotkeyWarnings: string[] = [];
let scanning = true;
let refreshFailed = false;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let configWatchStarted = false;
const stats = new StatsService();
const systemControls = new SystemControls();
let placeSerial = 0;
const placementHelper = createWindowSession({
  platform: process.platform,
  env: process.env,
});
let configFilePath = "";
let voice: VoiceSession | null = null;
const windowsSpeech = new WindowsSpeech();
const windowsInput = new WindowsInput();
let cliPipe: CliPipe | null = null;

function deepConfig() {
  return (launcher?.config ?? loadConfig(app.getPath("userData")).config).deep ?? DEFAULT_DEEP;
}

/** <home>\FA26\jarvis-builds when FA26 exists, else Documents\jarvis-builds. config.json "deep.workspace" wins. */
function deepWorkspace(): string {
  const configured = deepConfig().workspace;
  if (configured) return path.resolve(configured.replace(/^~(?=[\\/]|$)/, os.homedir()));
  const fa26 = path.join(os.homedir(), "FA26");
  if (fs.existsSync(fa26)) return path.join(fa26, "jarvis-builds");
  return path.join(app.getPath("documents"), "jarvis-builds");
}

/** claude.exe from the native installer, or claude.cmd from npm, or whatever is on PATH. */
function findClaude(): string | undefined {
  const configured = deepConfig().command;
  if (configured) return fs.existsSync(configured) ? configured : undefined;
  const home = os.homedir();
  const candidates = [
    path.join(home, ".local", "bin", "claude.exe"),
    process.env.APPDATA ? path.join(process.env.APPDATA, "npm", "claude.cmd") : "",
  ];
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!dir) continue;
    candidates.push(path.join(dir, "claude.exe"), path.join(dir, "claude.cmd"));
  }
  return candidates.find((file) => file && fs.existsSync(file));
}

const previewServer = new PreviewServer();

const deepAgent = new DeepAgent({
  config: deepConfig,
  workspace: deepWorkspace,
  findClaude,
  spawn: (file, args, cwd, shell) =>
    spawnProcess(file, [...args], {
      cwd,
      shell,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: "jarvis-launcher" },
    }),
  killTree: (pid) => {
    if (process.platform === "win32") {
      execFile(windowsSystemFile("taskkill.exe"), ["/PID", String(pid), "/T", "/F"], { windowsHide: true }, () => undefined);
    } else {
      process.kill(pid);
    }
  },
  exists: (file) => fs.existsSync(file),
  mkdir: (dir) => fs.mkdirSync(dir, { recursive: true }),
  readFile: (file) => {
    try {
      return fs.readFileSync(file, "utf8");
    } catch {
      return undefined;
    }
  },
  writeFile: (file, text) => fs.writeFileSync(file, text),
  appendFile: (file, text) => fs.appendFileSync(file, text),
  listDirs: (dir) =>
    fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({ name: entry.name, mtimeMs: fs.statSync(path.join(dir, entry.name)).mtimeMs })),
  open: async (target, projectDir) => {
    if (target.kind === "url") {
      await shell.openExternal(target.url);
      return;
    }
    if (/\.html?$/i.test(target.path)) {
      // Served over http so built sites' JavaScript modules run; file:// blocks them.
      const base = await previewServer.serve(projectDir);
      const urlPath = previewUrlPath(projectDir, target.path, path) ?? "/";
      const url = `${base}${urlPath}`;
      await shell.openExternal(process.platform === "win32" ? edgeUrl(url) : url);
      return;
    }
    const failed = await shell.openPath(target.path);
    if (failed) throw new Error(failed);
  },
  changed: () => voice?.update(),
  announce: (line) => voice?.announce(line),
  now: () => new Date(),
});
let launcher: {
  config: JarvisConfig;
  tiles: ResolvedTile[];
  view: LauncherTileView[];
  warnings: string[];
  dock: (string | null)[];
  plates: { slot: number; tileId: string }[];
  dials: { G: string | null; E: string | null };
} | null = null;

function iconImage(): Electron.NativeImage {
  return nativeImage.createFromPath(
    path.join(app.getAppPath(), "assets", "icon.png"),
  );
}

function existingEdgeExecutables(): string[] {
  if (process.platform !== "win32") return [];
  return defaultEdgeCandidates({
    ProgramFiles: process.env.ProgramFiles,
    "ProgramFiles(x86)": process.env["ProgramFiles(x86)"],
  }).filter((candidate) => {
    try {
      return fs.existsSync(candidate);
    } catch {
      return false;
    }
  });
}

function readShortcutTarget(lnkPath: string): string | undefined {
  if (process.platform !== "win32") return undefined;
  try {
    const details = shell.readShortcutLink(lnkPath);
    const target = details.target?.trim();
    return target || undefined;
  } catch {
    return undefined;
  }
}

function registerHotkey(hotkey: string): string {
  const next = hotkey || DEFAULT_HOTKEY;
  if (next === activeHotkey && globalShortcut.isRegistered(next)) {
    hotkeyWarnings = [];
    return next;
  }
  globalShortcut.unregisterAll();
  activeHotkey = "";
  if (globalShortcut.register(next, () => toggleWindow())) {
    activeHotkey = next;
    hotkeyWarnings = [];
    return next;
  }
  if (
    next !== DEFAULT_HOTKEY &&
    globalShortcut.register(DEFAULT_HOTKEY, () => toggleWindow())
  ) {
    activeHotkey = DEFAULT_HOTKEY;
  }
  hotkeyWarnings = hotkeyRegistrationWarnings(next, activeHotkey);
  return activeHotkey || next;
}

function syncLoginItem(openAtLogin: boolean): void {
  if (process.platform !== "win32" && process.platform !== "darwin") return;
  app.setLoginItemSettings(
    loginItemOptions(openAtLogin, {
      PORTABLE_EXECUTABLE_FILE: process.env.PORTABLE_EXECUTABLE_FILE,
    }),
  );
}

function applyHostSettings(
  config: JarvisConfig,
  warnings: string[],
): JarvisConfig {
  const registered =
    activeHotkey !== "" && globalShortcut.isRegistered(activeHotkey);
  if (
    config.hotkey !== appliedHotkeyRequest ||
    hotkeyWarnings.length > 0 ||
    !registered
  ) {
    registerHotkey(config.hotkey);
    appliedHotkeyRequest = config.hotkey;
  }
  warnings.push(...hotkeyWarnings);
  if (appliedLogin !== config.openAtLogin) {
    syncLoginItem(config.openAtLogin);
    appliedLogin = config.openAtLogin;
  }
  const hotkey = activeHotkey || config.hotkey;
  return hotkey === config.hotkey ? config : { ...config, hotkey };
}

async function fileIcon(
  target: string | undefined,
): Promise<string | undefined> {
  if (!target) return undefined;
  try {
    if (!fs.existsSync(target)) return undefined;
    const image = await app.getFileIcon(target, { size: "large" });
    if (image.isEmpty()) return undefined;
    return image.toDataURL();
  } catch {
    return undefined;
  }
}

async function tileViews(
  tiles: readonly ResolvedTile[],
): Promise<LauncherTileView[]> {
  return Promise.all(
    tiles.map(async (tile) => {
      const icon =
        (await fileIcon(tileIconFile(tile))) ?? tileFallbackIcon(tile);
      return icon
        ? { id: tile.id, label: tile.label, kind: tile.kind, icon }
        : { id: tile.id, label: tile.label, kind: tile.kind };
    }),
  );
}

const refreshGate = createRefreshGate(() => refreshSession());

function scheduleRefresh(): void {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    refreshGate.queueConfigEdit();
  }, 300);
}

function startConfigWatch(filePath: string): void {
  if (configWatchStarted) return;
  configWatchStarted = true;
  configFilePath = filePath;
  fs.watchFile(
    filePath,
    { persistent: true, interval: 1000 },
    (current, previous) => {
      if (
        current.mtimeMs === previous.mtimeMs &&
        current.size === previous.size
      )
        return;
      scheduleRefresh();
    },
  );
}

async function refreshSession(): Promise<void> {
  scanning = true;
  refreshFailed = false;
  publishState();
  try {
    const loaded = loadConfig(app.getPath("userData"));
    let discovered: DiscoveredApp[] = [];
    try {
      const discovery = await discoverInstalledApps({
        platform: process.platform,
        readTarget: readShortcutTarget,
      });
      discovered = discovery.apps;
      loaded.warnings.push(...discovery.warnings);
    } catch {
      loaded.warnings.push("App discovery failed; showing built-in tiles only");
    }
    const tiles = composeTiles(loaded.config, discovered, {
      platform: process.platform,
      edgeExecutables: existingEdgeExecutables(),
      explorerPath: windowsExplorerPath(process.env.SystemRoot),
      folders: {
        desktop: app.getPath("desktop"),
        documents: app.getPath("documents"),
        downloads: app.getPath("downloads"),
        pictures: app.getPath("pictures"),
      },
    });
    const view = await tileViews(tiles);
    const config = applyHostSettings(loaded.config, loaded.warnings);
    const hud = resolveHudSlots(
      config,
      tiles.map((tile) => tile.id),
    );
    loaded.warnings.push(...hud.warnings);
    launcher = {
      config,
      tiles,
      view,
      warnings: loaded.warnings,
      dock: hud.dock,
      plates: hud.plates,
      dials: hud.dials,
    };
    stats.setWeather(config.weather);
    scanning = false;
    refreshFailed = false;
    publishState();
    voice?.apply();
    startConfigWatch(loaded.filePath);
  } catch (error) {
    scanning = false;
    refreshFailed = true;
    publishState();
    voice?.apply();
    const fallbackPath = path.join(app.getPath("userData"), "config.json");
    startConfigWatch(fallbackPath);
    throw error;
  }
}

function currentState(): LauncherState {
  const snapshot = launcher;
  return {
    hotkey: snapshot?.config.hotkey ?? DEFAULT_HOTKEY,
    platform: process.platform,
    tiles: snapshot?.view ?? [],
    warnings: snapshot?.warnings ?? [],
    scanning,
    refreshFailed,
    dock: snapshot?.dock ?? [null, null, null, null],
    plates: snapshot?.plates ?? [],
    dials: snapshot?.dials ?? { G: null, E: null },
    leftList: snapshot?.config.leftList ?? "recent",
    iconStyle: snapshot?.config.iconStyle,
    icons: snapshot?.config.icons,
    motion: snapshot?.config.motion,
  };
}

function publishState(): void {
  const contents = mainWindow?.webContents;
  if (!contents || contents.isDestroyed()) return;
  contents.send("jarvis:state", currentState());
}

async function execute(
  action: ResolvedTile["action"],
): Promise<number | undefined> {
  return runLaunch(action, {
    openPath: (targetPath) => shell.openPath(targetPath),
    openExternal: (url) => shell.openExternal(url),
    spawn: (command, args) =>
      spawnDetached(command, args, (cmd, cmdArgs, options) =>
        spawnProcess(cmd, cmdArgs, options),
      ),
  });
}

function browserHwnd(win: BrowserWindow): number | undefined {
  try {
    const buf = win.getNativeWindowHandle();
    const value =
      buf.length >= 8
        ? buf.readBigUInt64LE(0)
        : buf.length >= 4
          ? BigInt(buf.readUInt32LE(0))
          : 0n;
    if (value <= 0n || value > BigInt(Number.MAX_SAFE_INTEGER))
      return undefined;
    return Number(value);
  } catch {
    return undefined;
  }
}

type PlacementOutcome = "placed" | "missed" | "skipped" | "cancelled";

/**
 * Move the new window in front of Jarvis.
 * The before list was taken at the click, before the app was launched.
 * `missed` means no window was found or the move failed, and Jarvis should hide.
 * A placed window stays in front of the full-screen launcher, which is not always on top.
 */
async function centerAfterLaunch(
  action: ResolvedTile["action"],
  spawnedPid: number | undefined,
  watch: WindowWatch,
  serial: number,
  baseline: readonly number[] | undefined,
): Promise<PlacementOutcome> {
  const win = mainWindow;
  const launchWindow = launcher?.config.launchWindow;
  if (!win || win.isDestroyed() || !launchWindow) return "skipped";
  if (process.platform !== "win32" || launchWindow.mode !== "centered")
    return "skipped";
  const launcherHwnd = browserHwnd(win);
  if (!launcherHwnd) return "missed";
  let workArea: Electron.Rectangle;
  try {
    workArea = screen.getDisplayMatching(win.getBounds()).workArea;
  } catch {
    return "missed";
  }
  try {
    const placed = await centerLaunchedWindow({
      platform: process.platform,
      mode: launchWindow.mode,
      widthPct: launchWindow.widthPct,
      heightPct: launchWindow.heightPct,
      workArea,
      launcherHwnd,
      launcherPid: process.pid,
      spawnedPid,
      baseline,
      target: targetFromAction(action, readShortcutTarget),
      // Physical pixels. The helper is per-monitor v2, so Windows does not scale these again.
      toScreenRect: (rect) => screen.dipToScreenRect(win, rect),
      nextSample: () =>
        serial === placeSerial
          ? watch.nextSample()
          : Promise.resolve(undefined),
      placeWindow: (hwnd, rect) =>
        serial === placeSerial
          ? watch.place(hwnd, rect)
          : Promise.resolve(false),
    });
    if (serial !== placeSerial) return "cancelled";
    return placed ? "placed" : "missed";
  } catch {
    if (serial !== placeSerial) return "cancelled";
    return "missed";
  }
}

function showWindow(): void {
  const win = mainWindow;
  if (!win || win.isDestroyed()) return;
  win.show();
  win.setFullScreen(true);
  win.focus();
}

function hideWindow(): void {
  const win = mainWindow;
  if (!win || win.isDestroyed()) return;
  win.hide();
  if (!win.webContents.isDestroyed()) win.webContents.send("jarvis:hidden");
}

/**
 * Center a window over the HUD, the same size a launched tile gets, and leave
 * Jarvis up behind it. Does nothing when launchWindow.mode is "default".
 */
async function popUpWindow(hwnd: number): Promise<boolean> {
  const win = mainWindow;
  const launchWindow = launcher?.config.launchWindow;
  if (process.platform !== "win32" || !win || win.isDestroyed()) return false;
  if (!launchWindow || launchWindow.mode !== "centered") return false;
  if (!Number.isSafeInteger(hwnd) || hwnd <= 0) return false;
  const watch = placementHelper.serve(2000);
  try {
    const workArea = screen.getDisplayMatching(win.getBounds()).workArea;
    const dip = centeredWindowRect(
      workArea,
      launchWindow.widthPct,
      launchWindow.heightPct,
    );
    const rect = screen.dipToScreenRect(win, dip);
    return await watch.place(hwnd, {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.max(1, Math.round(rect.width)),
      height: Math.max(1, Math.round(rect.height)),
    });
  } catch {
    return false;
  } finally {
    watch.close();
  }
}

/**
 * Open something (a file, a web page, Task Manager), then pop the window that
 * comes to the front up over the HUD. Jarvis stays visible.
 */
async function openAsPopUp(open: () => Promise<void>): Promise<void> {
  if (process.platform !== "win32") {
    await open();
    return;
  }
  const before = await windowsInput.foreground().catch(() => undefined);
  await open();
  const until = Date.now() + 5000;
  while (Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    const front = await windowsInput.foreground().catch(() => undefined);
    if (
      front &&
      front.hwnd !== 0 &&
      front.hwnd !== before?.hwnd &&
      front.pid !== process.pid
    ) {
      await popUpWindow(front.hwnd);
      return;
    }
  }
}

/** Pop up the window in front, unless it is Jarvis. */
async function popUpFront(): Promise<void> {
  if (process.platform !== "win32") return;
  await new Promise((resolve) => setTimeout(resolve, 400));
  const front = await windowsInput.foreground().catch(() => undefined);
  if (front && front.hwnd !== 0 && front.pid !== process.pid)
    await popUpWindow(front.hwnd);
}

function toggleWindow(): void {
  if (!mainWindow) return;
  if (mainWindow.isVisible()) hideWindow();
  else showWindow();
}

function isAppFrame(event: IpcMainInvokeEvent | IpcMainEvent): boolean {
  const contents = mainWindow?.webContents;
  if (!contents || contents.isDestroyed()) return false;
  return isMainFrameSender(event.senderFrame, contents.mainFrame);
}

function allowNavigation(url: string): boolean {
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (!devUrl) return false;
  try {
    return new URL(url).origin === new URL(devUrl).origin;
  } catch {
    return false;
  }
}

function createWindow(startHidden: boolean): void {
  mainWindow = new BrowserWindow({
    fullscreen: true,
    alwaysOnTop: false,
    frame: false,
    show: false,
    backgroundColor: "#03060a",
    autoHideMenuBar: true,
    title: "Jarvis",
    icon: iconImage(),
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (allowNavigation(url)) return;
    event.preventDefault();
  });

  mainWindow.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    hideWindow();
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) void mainWindow.loadURL(devUrl);
  else void mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));

  mainWindow.once("ready-to-show", () => {
    const hidden = launcher?.config.startHidden ?? startHidden;
    if (!hidden || !trayReady) showWindow();
  });
}

function createTray(): void {
  const image = iconImage();
  if (image.isEmpty()) return;
  try {
    tray = new Tray(image);
  } catch {
    tray = null;
    return;
  }
  tray.setToolTip("Jarvis");
  const menu = Menu.buildFromTemplate([
    { label: "Show", click: () => showWindow() },
    { label: "Hide", click: () => hideWindow() },
    {
      label: "Refresh",
      click: () => void refreshGate.requestRefresh().catch(() => undefined),
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
  tray.on("click", () => toggleWindow());
  trayReady = true;
}

const EMPTY_VOICE: VoiceSnapshot = {
  hasKey: false,
  enabled: false,
  capture: false,
  phase: "idle",
  heard: "",
  reply: "",
  error: "",
  launchError: "",
  deep: "",
};

/** C:\Windows\System32\<file>, or C:\Windows\<file> for explorer.exe. */
function windowsSystemFile(file: string, system32 = true): string {
  const root = process.env.SystemRoot ?? "C:\\Windows";
  return system32 ? path.join(root, "System32", file) : path.join(root, file);
}

/** How long to wait after hiding Jarvis before opening the calendar panel. */
const CALENDAR_SETTLE_MS = 500;

/** Paths behind the last recent-files list, keyed by the ids the page got. */
const recentTargets = new Map<string, string>();

/** Newest files from %APPDATA%\Microsoft\Windows\Recent whose targets exist. Windows only. */
async function readRecentFiles(): Promise<RecentItem[]> {
  recentTargets.clear();
  if (process.platform !== "win32") return [];
  const dir = path.join(
    app.getPath("appData"),
    "Microsoft",
    "Windows",
    "Recent",
  );
  let names: string[];
  try {
    names = (await fs.promises.readdir(dir)).filter((name) =>
      name.toLowerCase().endsWith(".lnk"),
    );
  } catch {
    return [];
  }
  const stamped = await Promise.all(
    names.map(async (name) => {
      try {
        return {
          name,
          mtimeMs: (await fs.promises.stat(path.join(dir, name))).mtimeMs,
        };
      } catch {
        return { name, mtimeMs: 0 };
      }
    }),
  );
  // Read only the newest shortcuts; resolving every one in a big folder is slow.
  const newest = stamped.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, 40);
  const shortcuts: RecentShortcut[] = newest.map((entry) => {
    let target = "";
    try {
      target = shell.readShortcutLink(path.join(dir, entry.name)).target ?? "";
    } catch {
      target = "";
    }
    return { ...entry, target, exists: target !== "" && fs.existsSync(target) };
  });
  return pickRecent(shortcuts).map((item, index) => {
    const id = String(index);
    recentTargets.set(id, item.target);
    return { id, name: item.name };
  });
}

function configPath(): string {
  return configFilePath || path.join(app.getPath("userData"), "config.json");
}

function publishVoice(snapshot: VoiceSnapshot): void {
  const contents = mainWindow?.webContents;
  if (!contents || contents.isDestroyed()) return;
  contents.send("jarvis:voice", snapshot);
}

/** Start menu apps for "open <app>", read at most once every five minutes. */
let startAppsCache: { at: number; apps: StoreApp[] } | null = null;

/** VS Code's Code.exe in its usual install folders. */
function findVsCode(): string | undefined {
  const candidates = [
    process.env.LOCALAPPDATA &&
      path.join(
        process.env.LOCALAPPDATA,
        "Programs",
        "Microsoft VS Code",
        "Code.exe",
      ),
    process.env.ProgramFiles &&
      path.join(process.env.ProgramFiles, "Microsoft VS Code", "Code.exe"),
    process.env["ProgramFiles(x86)"] &&
      path.join(
        process.env["ProgramFiles(x86)"],
        "Microsoft VS Code",
        "Code.exe",
      ),
  ];
  return candidates.find(
    (file): file is string => typeof file === "string" && fs.existsSync(file),
  );
}

const computerHost: ComputerHost = {
  available: () => windowsInput.available(),
  foreground: () => windowsInput.foreground(),
  find: (names) => windowsInput.find(names),
  focus: (hwnd) => windowsInput.focus(hwnd),
  typeLine: (text, expect, enter, delayMs, clear) =>
    windowsInput.typeLine(text, expect, enter, delayMs, clear),
  keys: (vks, expect) => windowsInput.keys(vks, expect),
  openExternal: (url) => shell.openExternal(url),
  spawnDetached: (file, args) => {
    const resolved =
      file === "explorer.exe" ? windowsSystemFile("explorer.exe", false) : file;
    spawnProcess(resolved, [...args], {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    }).unref();
  },
  launchTileByName: async (name) => {
    const tiles =
      launcher?.tiles.map((tile) => ({ id: tile.id, label: tile.label })) ?? [];
    const tile = matchTile(name, tiles);
    if (!tile) return undefined;
    const result = await launchTile(tile.id);
    return { ok: result.ok, label: tile.label, error: result.error };
  },
  startApps: async () => {
    if (startAppsCache && Date.now() - startAppsCache.at < 5 * 60_000)
      return startAppsCache.apps;
    // Every Start menu app, desktop installs such as Figma included.
    const read = await readStartApps(
      process.platform,
      process.env,
      undefined,
      isLaunchableAppId,
    );
    startAppsCache = { at: Date.now(), apps: read.apps };
    return read.apps;
  },
  documentsDir: () => app.getPath("documents"),
  vsCodePath: findVsCode,
  regExe: () => windowsSystemFile("reg.exe"),
  runFile: (file, args) =>
    new Promise((resolve, reject) => {
      execFile(
        file,
        [...args],
        { windowsHide: true, shell: false, timeout: 10_000 },
        (error) =>
          error ? reject(new Error("Setting did not change")) : resolve(),
      );
    }),
  exists: (file) => fs.existsSync(file),
  readFile: (file) => {
    try {
      return fs.readFileSync(file, "utf8");
    } catch {
      return undefined;
    }
  },
  mkdir: (dir) => fs.mkdirSync(dir, { recursive: true }),
  writeFile: (file, text) =>
    fs.writeFileSync(file, text, { flag: text ? "w" : "wx" }),
  ownPid: () => process.pid,
  popUp: (hwnd) => popUpWindow(hwnd),
  deep: (call) => deepAgent.handle(call),
  setTaskbarAutoHide: (on) => windowsInput.taskbarAutoHide(on),
  now: () => Date.now(),
  sleep: (ms, signal) =>
    new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new Error("Stopped"));
        return;
      }
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        clearTimeout(timer);
        reject(new Error("Stopped"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
    }),
};

function sendSpeech(audio: Uint8Array, contentType: string): void {
  const contents = mainWindow?.webContents;
  if (!contents || contents.isDestroyed()) return;
  contents.send("jarvis:voice-speak", {
    audio: Buffer.from(audio),
    contentType,
    effect: launcher?.config.voice.effect ?? "jarvis",
  });
}

/**
 * Jarvis says good morning when it starts: the date, and the weather once the
 * HUD has it. "daily" greets on the first start of each day; config.json
 * "greeting": { "mode": "launch" | "off", "name": "Rio" } changes that.
 */
async function greetOnStart(): Promise<void> {
  if (process.platform !== "win32") return;
  const config = loadConfig(app.getPath("userData")).config;
  const greeting = config.greeting ?? DEFAULT_GREETING;
  if (config.voice.enabled === false) return;
  const stateFile = path.join(app.getPath("userData"), "greeting.json");
  let lastDay: string | undefined;
  try {
    const saved = JSON.parse(fs.readFileSync(stateFile, "utf8")) as {
      lastDay?: unknown;
    };
    if (typeof saved.lastDay === "string") lastDay = saved.lastDay;
  } catch {
    // First greeting.
  }
  if (!shouldGreet(greeting.mode, lastDay, new Date())) return;

  // Give the weather and the page a moment to arrive; greet without weather after 12 seconds.
  const until = Date.now() + 12_000;
  while (Date.now() < until) {
    const pageReady = mainWindow && !mainWindow.webContents.isLoading();
    if (pageReady && (stats.snapshot().weather || !config.weather)) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const line = greetingLine({
    now: new Date(),
    name: greeting.name,
    weather: stats.snapshot().weather,
  });
  try {
    const audio = await windowsSpeech.speak(
      line,
      config.voice.voiceId,
      AbortSignal.timeout(20_000),
    );
    sendSpeech(audio.bytes, audio.contentType);
    fs.writeFileSync(
      stateFile,
      JSON.stringify({ lastDay: localDay(new Date()) }),
    );
  } catch {
    // No greeting this time; the HUD works the same.
  }
}

function installPermissions(): void {
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  const ownWindow = (contents: Electron.WebContents | null): boolean => {
    const current = mainWindow?.webContents;
    if (!current || current.isDestroyed()) return false;
    if (!contents) return true;
    return contents.id === current.id;
  };
  session.defaultSession.setPermissionCheckHandler(
    (contents, permission, requestingOrigin, details) => {
      if (!ownWindow(contents) || details.mediaType === "video") return false;
      return allowMediaPermission({
        permission,
        requestingUrl: details.requestingUrl || requestingOrigin,
        devServerUrl: devUrl,
        mainFrame: details.isMainFrame,
      });
    },
  );
  session.defaultSession.setPermissionRequestHandler(
    (contents, permission, callback, details) => {
      const mediaTypes =
        "mediaTypes" in details ? details.mediaTypes : undefined;
      if (
        !ownWindow(contents) ||
        mediaTypes?.some((type) => type !== "audio")
      ) {
        callback(false);
        return;
      }
      callback(
        allowMediaPermission({
          permission,
          requestingUrl: details.requestingUrl,
          devServerUrl: devUrl,
          mainFrame: details.isMainFrame,
        }),
      );
    },
  );
}

function pcmFromPayload(payload: unknown): Int16Array | undefined {
  let bytes: Buffer | undefined;
  if (payload instanceof ArrayBuffer) bytes = Buffer.from(payload);
  else if (Buffer.isBuffer(payload)) bytes = Buffer.from(payload);
  else if (ArrayBuffer.isView(payload))
    bytes = Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength);
  if (!bytes || bytes.length < 2) return undefined;
  const length = bytes.length - (bytes.length % 2);
  const copy = Buffer.from(bytes.subarray(0, length));
  return new Int16Array(copy.buffer, copy.byteOffset, copy.length / 2);
}

async function launchTile(tileId: string): Promise<LaunchResult> {
  if (!launcher) await refreshGate.requestRefresh();
  const current = launcher;
  if (!current) return { ok: false, error: "Unknown tile" };
  const tile = current.tiles.find((item) => item.id === tileId);
  if (!tile) return { ok: false, error: "Unknown tile" };
  const centering =
    process.platform === "win32" &&
    current.config.launchWindow.mode === "centered";
  const serial = centering ? ++placeSerial : placeSerial;
  let baseline: number[] | undefined;
  if (centering) {
    const before = await placementHelper.sample(LAUNCH_BASELINE_WAIT_MS);
    if (!before) {
      try {
        // The window list was not ready. Pop whatever comes to the front.
        await openAsPopUp(async () => {
          await execute(tile.action);
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Launch failed";
        return { ok: false, error: message };
      }
      return { ok: true };
    }
    baseline = before.windows.map((window) => window.hwnd);
  }
  try {
    const spawnedPid = await execute(tile.action);
    if (!centering) return { ok: true };
    const watch = placementHelper.serve(LAUNCH_WINDOW_WATCH_MS);
    try {
      const outcome = await centerAfterLaunch(
        tile.action,
        spawnedPid,
        watch,
        serial,
        baseline,
      );
      // Web pages open as a tab in a browser that was already running, so
      // there is no new window to find. Pop up whatever is in front instead
      // of hiding Jarvis.
      if (outcome === "missed") void popUpFront();
      return { ok: true };
    } finally {
      watch.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Launch failed";
    return { ok: false, error: message };
  }
}

function registerIpc(): void {
  ipcMain.handle("jarvis:get-state", (event) => {
    if (!isAppFrame(event))
      return { ...currentState(), warnings: ["Untrusted frame"] };
    return currentState();
  });

  ipcMain.handle("jarvis:launch", (event, tileId: unknown) => {
    if (!isAppFrame(event)) return { ok: false, error: "Untrusted frame" };
    if (typeof tileId !== "string") return { ok: false, error: "Unknown tile" };
    return launchTile(tileId);
  });

  ipcMain.handle("jarvis:refresh", (event) => {
    if (!isAppFrame(event)) return;
    return refreshGate.requestRefresh();
  });

  ipcMain.on("jarvis:hide", (event) => {
    if (!isAppFrame(event)) return;
    hideWindow();
  });
  ipcMain.on("jarvis:quit", (event) => {
    if (!isAppFrame(event)) return;
    quitting = true;
    app.quit();
  });

  ipcMain.handle("jarvis:system-state", (event) => {
    if (!isAppFrame(event)) return null;
    return systemControls.snapshot();
  });

  ipcMain.handle(
    "jarvis:system-action",
    async (event, action: unknown, value: unknown) => {
      if (!isAppFrame(event)) return { ok: false, error: "Untrusted frame" };
      const checked = checkSystemAction(action, value);
      if (!checked) return { ok: false, error: "Unknown action" };
      // Hide first so the HUD is not left over the desktop after sleep, lock, or
      // sign out. The calendar is the exception: Windows closes its panel as
      // soon as focus moves, and hiding Jarvis moves focus. The panel is
      // topmost, so it opens over the HUD instead.
      if ((POWER_ACTIONS as readonly string[]).includes(checked.action))
        hideWindow();
      if (checked.action === "open-taskmgr") {
        // ShellExecute, so Windows can show its own prompt when Task Manager needs one.
        const problem = await shell.openPath(windowsSystemFile("Taskmgr.exe"));
        if (problem) return { ok: false, error: "Task Manager did not open" };
        // Jarvis stays up; Task Manager opens over it.
        void popUpFront();
        return { ok: true };
      }
      if (checked.action === "open-calendar") {
        // Windows closes the calendar panel as soon as focus moves. Hide
        // Jarvis, let focus settle on the window behind it, and only then
        // open the panel, the same as running the link from a terminal.
        hideWindow();
        await new Promise((resolve) => setTimeout(resolve, CALENDAR_SETTLE_MS));
        const build = os.release();
        if (calendarShortcut(build) === "win-n") {
          // Windows 11 keeps the calendar in the Notification Center, which
          // its ms-actioncenter: link opens.
          try {
            spawnProcess(
              windowsSystemFile("explorer.exe", false),
              ["ms-actioncenter:"],
              {
                detached: true,
                stdio: "ignore",
                windowsHide: false,
              },
            ).unref();
          } catch {
            return { ok: false, error: "The calendar did not open" };
          }
          return {
            ok: true,
            detail: `Calendar: opened ms-actioncenter: on Windows ${build}`,
          };
        }
        try {
          const state = await systemControls.run("open-calendar", 0);
          return {
            ok: true,
            state,
            detail: `Calendar: sent Win+Alt+D on Windows ${build}`,
          };
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "The calendar did not open",
          };
        }
      }
      if (checked.action === "open-recyclebin") {
        try {
          spawnProcess(
            windowsSystemFile("explorer.exe", false),
            ["shell:RecycleBinFolder"],
            {
              detached: true,
              stdio: "ignore",
              windowsHide: false,
            },
          ).unref();
        } catch {
          return { ok: false, error: "Recycle Bin did not open" };
        }
        void popUpFront();
        return { ok: true };
      }
      try {
        const state = await systemControls.run(checked.action, checked.value);
        if (checked.action === "empty-recyclebin") stats.refreshRecycle();
        return { ok: true, state };
      } catch (error) {
        return {
          ok: false,
          error:
            error instanceof Error ? error.message : "System action failed",
        };
      }
    },
  );

  ipcMain.handle("jarvis:get-settings", (event) => {
    if (!isAppFrame(event)) return null;
    const config =
      launcher?.config ?? loadConfig(app.getPath("userData")).config;
    return settingsFromConfig(config);
  });

  ipcMain.handle("jarvis:save-settings", async (event, values: unknown) => {
    if (!isAppFrame(event)) return { ok: false, error: "Untrusted frame" };
    const problem = checkSettings(values);
    if (problem) return { ok: false, error: problem };
    const file = configPath();
    let raw: Record<string, unknown> = {};
    try {
      const text = fs.readFileSync(file, "utf8");
      const parsed: unknown = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return {
          ok: false,
          error: "config.json is not a JSON object; fix it first",
        };
      }
      raw = parsed as Record<string, unknown>;
    } catch (error) {
      // A missing file is fine. A file with a syntax error is not overwritten.
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        return {
          ok: false,
          error: "config.json has a syntax error; fix it first",
        };
      }
    }
    const merged = mergeSettings(raw, values as SettingsValues);
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const temp = `${file}.tmp`;
      fs.writeFileSync(temp, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
      fs.renameSync(temp, file);
    } catch {
      return { ok: false, error: "Could not write config.json" };
    }
    void refreshGate.requestRefresh().catch(() => undefined);
    return { ok: true };
  });

  ipcMain.handle("jarvis:find-place", async (event, query: unknown) => {
    if (!isAppFrame(event)) return { ok: false, error: "Untrusted frame" };
    const url = geocodeUrl(query);
    if (!url) return { ok: false, error: "Type at least two letters" };
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) return { ok: false, error: "Place search failed" };
      return { ok: true, places: parseGeocode(await response.json()) };
    } catch {
      return { ok: false, error: "Place search failed" };
    }
  });

  ipcMain.handle("jarvis:recent", async (event) => {
    if (!isAppFrame(event)) return [];
    return readRecentFiles();
  });

  ipcMain.handle("jarvis:open-recent", async (event, id: unknown) => {
    if (!isAppFrame(event)) return { ok: false, error: "Untrusted frame" };
    // Only a path this process listed itself can be opened.
    const target = typeof id === "string" ? recentTargets.get(id) : undefined;
    if (!target)
      return { ok: false, error: "That file is no longer in the list" };
    const problem = await shell.openPath(target);
    if (problem) return { ok: false, error: "The file did not open" };
    void popUpFront();
    return { ok: true };
  });

  ipcMain.handle("jarvis:locate", async (event) => {
    if (!isAppFrame(event)) return { ok: false, error: "Untrusted frame" };
    try {
      const response = await fetch(IP_LOCATION_URL, {
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) return { ok: false, error: "Location lookup failed" };
      const place = parseIpLocation(await response.json());
      return place
        ? { ok: true, place }
        : { ok: false, error: "Location lookup failed" };
    } catch {
      return { ok: false, error: "Location lookup failed" };
    }
  });

  ipcMain.handle("jarvis:open-config", async (event) => {
    if (!isAppFrame(event)) return { ok: false, error: "Untrusted frame" };
    // Opens the file in the default editor for .json. Jarvis re-reads it when it is saved.
    const problem = await shell.openPath(configPath());
    if (problem) return { ok: false, error: "Could not open config.json" };
    void popUpFront();
    return { ok: true };
  });

  ipcMain.handle("jarvis:web-search", async (event, query: unknown) => {
    if (!isAppFrame(event)) return { ok: false, error: "Untrusted frame" };
    const url = webSearchUrl(query);
    if (!url) return { ok: false, error: "Empty search" };
    try {
      await shell.openExternal(url);
      void popUpFront();
      return { ok: true };
    } catch {
      return { ok: false, error: "Browser did not open" };
    }
  });

  ipcMain.handle("jarvis:stats", (event) => {
    if (!isAppFrame(event)) return null;
    return stats.snapshot();
  });

  ipcMain.handle("jarvis:voice-get", (event) => {
    if (!isAppFrame(event)) return EMPTY_VOICE;
    return voice?.snapshot() ?? EMPTY_VOICE;
  });
  ipcMain.handle("jarvis:voice-talk", (event) => {
    if (!isAppFrame(event)) return { ok: false, error: "Untrusted frame" };
    if (!voice) return { ok: false, error: "Voice is not ready" };
    return voice.talk();
  });
  ipcMain.handle("jarvis:voice-enabled", (event, enabled: unknown) => {
    if (!isAppFrame(event) || typeof enabled !== "boolean") return;
    return voice?.setEnabled(enabled);
  });
  ipcMain.on("jarvis:voice-pcm", (event, payload: unknown) => {
    if (!isAppFrame(event)) return;
    const samples = pcmFromPayload(payload);
    if (samples) voice?.onPcm(samples);
  });
  ipcMain.on("jarvis:voice-played", (event) => {
    if (!isAppFrame(event)) return;
    voice?.playbackEnded();
  });
  ipcMain.on("jarvis:voice-error", (event, message: unknown) => {
    if (!isAppFrame(event)) return;
    voice?.reportError(typeof message === "string" ? message : "");
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.setPath("userData", path.join(app.getPath("appData"), "jarvis-launcher"));
  app.on("second-instance", () => showWindow());
  app.whenReady().then(async () => {
    if (process.platform === "win32") placementHelper.start();
    app.setAppUserModelId("com.mario.jarvis-launcher");
    installPermissions();
    voice = createVoiceSession({
      tiles: () =>
        launcher?.tiles.map((tile) => ({ id: tile.id, label: tile.label })) ??
        [],
      voice: () =>
        launcher?.config.voice ??
        loadConfig(app.getPath("userData")).config.voice,
      env: () => process.env,
      configText: () => {
        try {
          return fs.readFileSync(configPath(), "utf8");
        } catch {
          return undefined;
        }
      },
      writeConfig: (text) => {
        try {
          fs.writeFileSync(configPath(), text);
          return true;
        } catch {
          return false;
        }
      },
      show: () => showWindow(),
      hide: () => hideWindow(),
      launch: (tileId) => launchTile(tileId),
      refresh: () => refreshGate.requestRefresh(),
      publish: publishVoice,
      speak: sendSpeech,
      synthesize: (text, voiceName, signal) =>
        windowsSpeech.speak(text, voiceName, signal),
      control: (pc) =>
        systemControls.run(pc.action, pc.value).then(() => undefined),
      computerTask: () =>
        windowsInput.available() ? new ComputerTask(computerHost) : undefined,
      modelDir: () => resolveWakeDir(app.getAppPath()),
      patchEnabled: patchVoiceEnabledText,
      deepEnabled: () => process.platform === "win32" && deepConfig().enabled,
      deepStatus: () => deepAgent.status(),
    });
    registerIpc();
    stats.start();
    // Paint before discovery. Get-StartApps can use its full timeout.
    const startHidden = loadConfig(app.getPath("userData")).config.startHidden;
    createWindow(startHidden);
    createTray();
    void voice.start();
    // The `jarvis` terminal command sends typed requests here.
    cliPipe = new CliPipe(app.getPath("userData"), (text, speak) =>
      voice
        ? voice.ask(text, speak)
        : Promise.resolve({
            ok: false,
            lines: [],
            error: "Jarvis is starting",
          }),
    );
    cliPipe.start();
    void greetOnStart();
    await refreshGate.requestRefresh().catch(() => {
      // refreshSession published refreshFailed and cleared scanning.
    });
  });

  app.on("before-quit", () => {
    deepAgent.cancel();
    previewServer.stop();
    stats.stop();
    systemControls.stop();
    quitting = true;
    voice?.stop();
    windowsSpeech.stop();
    windowsInput.stop();
    cliPipe?.stop();
    placementHelper.stop();
    if (refreshTimer) clearTimeout(refreshTimer);
    if (configFilePath) fs.unwatchFile(configFilePath);
    globalShortcut.unregisterAll();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      // The tray keeps the process alive. A real quit sets `quitting` first.
      if (quitting) app.quit();
    }
  });
}
