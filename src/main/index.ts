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
} from "electron";
import { loadConfig } from "../config/load";
import { discoverInstalledApps } from "../discovery";
import { DEFAULT_HOTKEY } from "../shared/config";
import { defaultEdgeCandidates, runLaunch } from "../shared/launch";
import { composeTiles } from "../shared/tiles";
import type { DiscoveredApp, JarvisConfig, LauncherState, ResolvedTile } from "../shared/types";

const DISCOVERY_CACHE_MS = 15_000;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let activeHotkey = "";
let discoveredCache: { at: number; apps: DiscoveredApp[] } | null = null;
let session: { config: JarvisConfig; tiles: ResolvedTile[]; warnings: string[] } | null = null;

function iconImage(): Electron.NativeImage {
  const file = path.join(app.getAppPath(), "assets", "icon.png");
  const image = nativeImage.createFromPath(file);
  if (!image.isEmpty()) return image;
  return nativeImage.createEmpty();
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

async function loadDiscovered(): Promise<DiscoveredApp[]> {
  const now = Date.now();
  if (discoveredCache && now - discoveredCache.at < DISCOVERY_CACHE_MS) return discoveredCache.apps;
  const apps = await discoverInstalledApps({
    platform: process.platform,
    readTarget: readShortcutTarget,
  });
  discoveredCache = { at: now, apps };
  return apps;
}

function registerHotkey(hotkey: string, warnings: string[]): string {
  const next = hotkey || DEFAULT_HOTKEY;
  if (next === activeHotkey && globalShortcut.isRegistered(next)) return next;
  globalShortcut.unregisterAll();
  activeHotkey = "";
  const ok = globalShortcut.register(next, () => toggleWindow());
  if (ok) {
    activeHotkey = next;
    return next;
  }
  warnings.push(`Could not register ${next}; trying ${DEFAULT_HOTKEY}`);
  if (next !== DEFAULT_HOTKEY && globalShortcut.register(DEFAULT_HOTKEY, () => toggleWindow())) {
    activeHotkey = DEFAULT_HOTKEY;
    return DEFAULT_HOTKEY;
  }
  warnings.push("No global hotkey is registered");
  return next;
}

function syncLoginItem(openAtLogin: boolean): void {
  if (process.platform !== "win32" && process.platform !== "darwin") return;
  app.setLoginItemSettings({ openAtLogin });
}

async function refreshSession(): Promise<void> {
  const loaded = loadConfig(app.getPath("userData"));
  let discovered: DiscoveredApp[] = [];
  try {
    discovered = await loadDiscovered();
  } catch {
    loaded.warnings.push("App discovery failed; showing built-in tiles only");
  }
  const hotkey = registerHotkey(loaded.config.hotkey, loaded.warnings);
  const config = hotkey === loaded.config.hotkey ? loaded.config : { ...loaded.config, hotkey };
  const tiles = composeTiles(config, discovered, {
    platform: process.platform,
    edgeExecutables: existingEdgeExecutables(),
    folders: {
      desktop: app.getPath("desktop"),
      documents: app.getPath("documents"),
      downloads: app.getPath("downloads"),
      pictures: app.getPath("pictures"),
    },
  });
  session = { config, tiles, warnings: loaded.warnings };
  syncLoginItem(config.openAtLogin);
}

function currentState(): LauncherState {
  const snapshot = session;
  return {
    hotkey: snapshot?.config.hotkey ?? DEFAULT_HOTKEY,
    platform: process.platform,
    tiles: (snapshot?.tiles ?? []).map(({ id, label, kind }) => ({ id, label, kind })),
    warnings: snapshot?.warnings ?? [],
  };
}

async function execute(action: Parameters<typeof runLaunch>[0]): Promise<void> {
  await runLaunch(action, {
    openPath: (targetPath) => shell.openPath(targetPath),
    openExternal: (url) => shell.openExternal(url),
    spawn: (command, args) => {
      const child = spawnProcess(command, [...args], {
        detached: true,
        stdio: "ignore",
        windowsHide: false,
      });
      child.unref();
    },
  });
}

function showWindow(): void {
  if (!mainWindow) return;
  mainWindow.show();
  mainWindow.setFullScreen(true);
  mainWindow.focus();
}

function hideWindow(): void {
  mainWindow?.hide();
}

function toggleWindow(): void {
  if (!mainWindow) return;
  if (mainWindow.isVisible()) hideWindow();
  else showWindow();
}

function createWindow(): void {
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

  mainWindow.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    hideWindow();
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) void mainWindow.loadURL(devUrl);
  else void mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));

  mainWindow.once("ready-to-show", () => {
    if (!session?.config.startHidden) showWindow();
  });
}

function createTray(): void {
  const image = iconImage();
  if (image.isEmpty()) return;
  tray = new Tray(image);
  tray.setToolTip("Jarvis");
  const menu = Menu.buildFromTemplate([
    { label: "Show", click: () => showWindow() },
    { label: "Hide", click: () => hideWindow() },
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
}

function registerIpc(): void {
  ipcMain.handle("jarvis:get-state", async () => {
    await refreshSession();
    return currentState();
  });

  ipcMain.handle("jarvis:launch", async (_event, tileId: unknown) => {
    if (!session) await refreshSession();
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

  ipcMain.on("jarvis:hide", () => hideWindow());
  ipcMain.on("jarvis:quit", () => {
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
    await refreshSession();
    createWindow();
    createTray();
  });

  app.on("before-quit", () => {
    quitting = true;
    globalShortcut.unregisterAll();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      // The tray keeps the process alive. A real quit sets `quitting` first.
      if (quitting) app.quit();
    }
  });
}
