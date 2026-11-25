import { spawn as spawnProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  shell,
  Tray,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from "electron";
import { loadConfig } from "../config/load";
import { discoverInstalledApps } from "../discovery";
import { DEFAULT_HOTKEY } from "../shared/config";
import { hotkeyRegistrationWarnings } from "../shared/hotkey";
import { tileFallbackIcon, tileIconFile } from "../shared/icons";
import { defaultEdgeCandidates, runLaunch, spawnDetached, windowsExplorerPath } from "../shared/launch";
import { loginItemOptions } from "../shared/login-item";
import { createRefreshGate, isMainFrameSender, startRefreshIfTrusted } from "../shared/refresh";
import { composeTiles } from "../shared/tiles";
import type { DiscoveredApp, JarvisConfig, LauncherState, LauncherTileView, ResolvedTile } from "../shared/types";

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
let configFilePath = "";
let session: { config: JarvisConfig; tiles: ResolvedTile[]; view: LauncherTileView[]; warnings: string[] } | null =
  null;

function iconImage(): Electron.NativeImage {
  return nativeImage.createFromPath(path.join(app.getAppPath(), "assets", "icon.png"));
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
  if (next !== DEFAULT_HOTKEY && globalShortcut.register(DEFAULT_HOTKEY, () => toggleWindow())) {
    activeHotkey = DEFAULT_HOTKEY;
  }
  hotkeyWarnings = hotkeyRegistrationWarnings(next, activeHotkey);
  return activeHotkey || next;
}

function syncLoginItem(openAtLogin: boolean): void {
  if (process.platform !== "win32" && process.platform !== "darwin") return;
  app.setLoginItemSettings(
    loginItemOptions(openAtLogin, { PORTABLE_EXECUTABLE_FILE: process.env.PORTABLE_EXECUTABLE_FILE }),
  );
}

function applyHostSettings(config: JarvisConfig, warnings: string[]): JarvisConfig {
  const registered = activeHotkey !== "" && globalShortcut.isRegistered(activeHotkey);
  if (config.hotkey !== appliedHotkeyRequest || hotkeyWarnings.length > 0 || !registered) {
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

async function fileIcon(target: string | undefined): Promise<string | undefined> {
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

async function tileViews(tiles: readonly ResolvedTile[]): Promise<LauncherTileView[]> {
  return Promise.all(
    tiles.map(async (tile) => {
      const icon = (await fileIcon(tileIconFile(tile))) ?? tileFallbackIcon(tile);
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
  fs.watchFile(filePath, { persistent: true, interval: 1000 }, (current, previous) => {
    if (current.mtimeMs === previous.mtimeMs && current.size === previous.size) return;
    scheduleRefresh();
  });
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
    session = { config, tiles, view, warnings: loaded.warnings };
    scanning = false;
    refreshFailed = false;
    publishState();
    startConfigWatch(loaded.filePath);
  } catch (error) {
    scanning = false;
    refreshFailed = true;
    publishState();
    throw error;
  }
}

function currentState(): LauncherState {
  const snapshot = session;
  return {
    hotkey: snapshot?.config.hotkey ?? DEFAULT_HOTKEY,
    platform: process.platform,
    tiles: snapshot?.view ?? [],
    warnings: snapshot?.warnings ?? [],
    scanning,
    refreshFailed,
  };
}

function publishState(): void {
  const contents = mainWindow?.webContents;
  if (!contents || contents.isDestroyed()) return;
  contents.send("jarvis:state", currentState());
}

async function execute(action: ResolvedTile["action"]): Promise<void> {
  await runLaunch(action, {
    openPath: (targetPath) => shell.openPath(targetPath),
    openExternal: (url) => shell.openExternal(url),
    spawn: (command, args) => spawnDetached(command, args, (cmd, cmdArgs, options) => spawnProcess(cmd, cmdArgs, options)),
  });
}

function showWindow(): void {
  const win = mainWindow;
  if (!win || win.isDestroyed()) return;
  win.show();
  win.setFullScreen(true);
  win.focus();
}

function hideWindow(): void {
  mainWindow?.hide();
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
    const hidden = session?.config.startHidden ?? startHidden;
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
    { label: "Refresh", click: () => void refreshGate.requestRefresh().catch(() => undefined) },
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

function registerIpc(): void {
  ipcMain.handle("jarvis:get-state", (event) => {
    if (!isAppFrame(event)) return { ...currentState(), warnings: ["Untrusted frame"] };
    return currentState();
  });

  ipcMain.handle("jarvis:launch", async (event, tileId: unknown) => {
    if (!isAppFrame(event)) return { ok: false, error: "Untrusted frame" };
    if (!session) await refreshGate.requestRefresh();
    if (typeof tileId !== "string") return { ok: false, error: "Unknown tile" };
    const tile = session?.tiles.find((item) => item.id === tileId);
    if (!tile) return { ok: false, error: "Unknown tile" };
    try {
      await execute(tile.action);
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Launch failed";
      return { ok: false, error: message };
    }
  });

  ipcMain.handle("jarvis:refresh", (event) => {
    const contents = mainWindow?.webContents;
    const mainFrame = contents && !contents.isDestroyed() ? contents.mainFrame : null;
    return startRefreshIfTrusted(event.senderFrame, mainFrame, () => refreshGate.requestRefresh());
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
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.setPath("userData", path.join(app.getPath("appData"), "jarvis-launcher"));
  app.on("second-instance", () => showWindow());
  app.whenReady().then(async () => {
    app.setAppUserModelId("com.mario.jarvis-launcher");
    registerIpc();
    // Paint before discovery. Get-StartApps can use its full timeout.
    const startHidden = loadConfig(app.getPath("userData")).config.startHidden;
    createWindow(startHidden);
    createTray();
    await refreshGate.requestRefresh().catch(() => {
      // refreshSession published refreshFailed and cleared scanning.
    });
  });

  app.on("before-quit", () => {
    quitting = true;
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
