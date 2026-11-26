import path from "node:path";
import type { StoreApp } from "../shared/start-apps";
import {
  KEY_COMBOS,
  mergeWorkspaceSettings,
  OUTLOOK_PROCESSES,
  VSCODE_PROCESSES,
  SETTINGS_PAGES,
  codeLines,
  mailtoUrl,
  edgeUrl,
  spotifySearchUrl,
  spotifyWebSearchUrl,
  textLines,
  type ComputerCall,
} from "../shared/computer";
import { scoreTileLabel, TILE_MATCH_THRESHOLD } from "../shared/voice-command";
import type { ForegroundWindow } from "./windows-input";

/** What the runner needs from Electron and Windows, so it can be tested with fakes. */
export interface ComputerHost {
  available(): boolean;
  foreground(): Promise<ForegroundWindow | undefined>;
  find(processNames: readonly string[]): Promise<number>;
  focus(hwnd: number): Promise<ForegroundWindow | undefined>;
  typeLine(
    text: string,
    expect: number,
    enter: boolean,
    delayMs: number,
    clear?: boolean,
  ): Promise<boolean>;
  keys(vks: readonly number[], expect: number): Promise<boolean>;
  openExternal(url: string): Promise<void>;
  spawnDetached(file: string, args: readonly string[]): void;
  /** Opens a launcher tile whose label matches, or returns undefined when none does. */
  launchTileByName(
    name: string,
  ): Promise<{ ok: boolean; label: string; error?: string } | undefined>;
  startApps(): Promise<StoreApp[]>;
  documentsDir(): string;
  vsCodePath(): string | undefined;
  regExe(): string;
  runFile(file: string, args: readonly string[]): Promise<void>;
  exists(file: string): boolean;
  readFile(file: string): string | undefined;
  mkdir(dir: string): void;
  writeFile(file: string, text: string): void;
  ownPid(): number;
  /** Center a window over the HUD, the same size a launched tile gets. */
  popUp(hwnd: number): Promise<boolean>;
  setTaskbarAutoHide(on: boolean): Promise<boolean>;
  now(): number;
  sleep(ms: number, signal: AbortSignal): Promise<void>;
}

export const PROJECTS_FOLDER = "Jarvis Projects";
const CODE_DELAY_MS = 22;
const EMAIL_DELAY_MS = 14;
const TEXT_DELAY_MS = 16;

function ok(message: string): string {
  return `OK: ${message}`;
}

function failed(message: string): string {
  return `Failed: ${message}`;
}

/** Best Start menu app for a spoken name, or undefined. */
export function matchStartApp(
  name: string,
  apps: readonly StoreApp[],
): StoreApp | undefined {
  let best: StoreApp | undefined;
  let score = TILE_MATCH_THRESHOLD;
  for (const app of apps) {
    const next = scoreTileLabel(name, app.name);
    if (
      next > score ||
      (next === score && best && app.name.length < best.name.length)
    ) {
      best = app;
      score = next;
    }
  }
  return best;
}

/** A name in the folder that does not exist yet: hello.py, then hello-2.py, hello-3.py. */
export function freeName(
  dir: string,
  filename: string,
  exists: (file: string) => boolean,
): string {
  if (!exists(path.join(dir, filename))) return filename;
  const dot = filename.lastIndexOf(".");
  const stem = filename.slice(0, dot);
  const ext = filename.slice(dot);
  for (let index = 2; index < 100; index++) {
    const next = `${stem}-${index}${ext}`;
    if (!exists(path.join(dir, next))) return next;
  }
  return `${stem}-${Date.now()}${ext}`;
}

/**
 * Runs checked calls for one spoken task. It remembers the window the last
 * opened app brought to the front, and types only into that window.
 */
export class ComputerTask {
  private target: number | undefined;

  constructor(private readonly host: ComputerHost) {}

  async run(call: ComputerCall, signal: AbortSignal): Promise<string> {
    if (!this.host.available())
      return failed("computer control only works on Windows");
    switch (call.tool) {
      case "open_app":
        return this.openApp(call.name, signal);
      case "open_settings":
        await this.host.openExternal(SETTINGS_PAGES[call.page]);
        return ok(`opened ${call.page} settings`);
      case "set_theme": {
        const value = call.mode === "dark" ? "0" : "1";
        const key =
          "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize";
        for (const name of ["AppsUseLightTheme", "SystemUsesLightTheme"]) {
          await this.host.runFile(this.host.regExe(), [
            "add",
            key,
            "/v",
            name,
            "/t",
            "REG_DWORD",
            "/d",
            value,
            "/f",
          ]);
        }
        return ok(`Windows is now in ${call.mode} mode`);
      }
      case "set_taskbar":
        return (await this.host.setTaskbarAutoHide(call.autohide))
          ? ok(
              call.autohide
                ? "the taskbar now hides until the mouse touches the bottom edge"
                : "the taskbar always shows again",
            )
          : failed("the taskbar setting did not change");
      case "spotify_search":
        try {
          await this.host.openExternal(spotifySearchUrl(call.query));
          return ok(
            `Spotify shows results for ${call.query}; the user presses play`,
          );
        } catch {
          await this.host.openExternal(spotifyWebSearchUrl(call.query));
          return ok(`opened Spotify on the web with results for ${call.query}`);
        }
      case "open_website":
        return this.openWebsite(call.url, call.label, call.browser, signal);
      case "write_code":
        return this.writeCode(call.filename, call.code, signal);
      case "draft_email":
        return this.draftEmail(call.to, call.subject, call.body, signal);
      case "type_text":
        return this.typeText(call.text, signal);
      case "press_keys":
        return this.pressKeys(call.keys);
      case "wait":
        await this.host.sleep(call.seconds * 1000, signal);
        return ok(`waited ${call.seconds} seconds`);
    }
  }

  /** Waits for a new window in front that is not Jarvis. */
  private async waitForNewWindow(
    before: number | undefined,
    signal: AbortSignal,
    timeoutMs: number,
    accept: (window: ForegroundWindow) => boolean = () => true,
  ): Promise<ForegroundWindow | undefined> {
    const until = this.host.now() + timeoutMs;
    while (this.host.now() < until) {
      const window = await this.host.foreground();
      if (
        window &&
        window.hwnd !== 0 &&
        window.hwnd !== before &&
        window.pid !== this.host.ownPid() &&
        accept(window)
      ) {
        return window;
      }
      await this.host.sleep(400, signal);
    }
    return undefined;
  }

  private async openApp(name: string, signal: AbortSignal): Promise<string> {
    const before = (await this.host.foreground())?.hwnd;
    const tile = await this.host.launchTileByName(name);
    let label = name;
    if (tile) {
      if (!tile.ok)
        return failed(
          `${tile.label} did not open: ${tile.error ?? "launch failed"}`,
        );
      label = tile.label;
    } else {
      const app = matchStartApp(name, await this.host.startApps());
      if (!app) return failed(`no installed app is called ${name}`);
      this.host.spawnDetached("explorer.exe", [
        `shell:AppsFolder\\${app.appId}`,
      ]);
      label = app.name;
    }
    const window = await this.waitForNewWindow(before, signal, 10_000);
    if (!window) {
      this.target = undefined;
      return ok(`started ${label}, but its window has not come to the front`);
    }
    this.target = window.hwnd;
    await this.host.popUp(window.hwnd);
    await this.host.sleep(800, signal);
    return ok(
      `${label} is open and in front (window title: ${window.title || label})`,
    );
  }

  private async openWebsite(
    url: string,
    label: string,
    browser: "edge" | "default",
    signal: AbortSignal,
  ): Promise<string> {
    const before = (await this.host.foreground())?.hwnd;
    await this.host.openExternal(browser === "edge" ? edgeUrl(url) : url);
    const window = await this.waitForNewWindow(before, signal, 6_000);
    this.target = window?.hwnd;
    if (window) await this.host.popUp(window.hwnd);
    return ok(
      `opened ${label} (${url}) in ${browser === "edge" ? "Microsoft Edge" : "the default browser"}`,
    );
  }

  /** The window to type into: the app opened in this task, or the window in front that is not Jarvis. */
  private async typingTarget(): Promise<number | undefined> {
    const window = await this.host.foreground();
    if (!window || window.pid === this.host.ownPid()) return undefined;
    if (this.target !== undefined && window.hwnd !== this.target) {
      const back = await this.host.focus(this.target);
      return back?.hwnd === this.target ? this.target : undefined;
    }
    return window.hwnd;
  }

  private async typeLines(
    lines: readonly string[],
    hwnd: number,
    delayMs: number,
    signal: AbortSignal,
    clearIndent = false,
  ): Promise<number> {
    for (let index = 0; index < lines.length; index++) {
      if (signal.aborted) return index;
      const typed = await this.host.typeLine(
        lines[index] ?? "",
        hwnd,
        index < lines.length - 1,
        delayMs,
        clearIndent,
      );
      if (!typed) return index;
    }
    return lines.length;
  }

  private async typeText(text: string, signal: AbortSignal): Promise<string> {
    const hwnd = await this.typingTarget();
    if (hwnd === undefined)
      return failed(
        "there is no app window in front to type into; open one first",
      );
    const lines = textLines(text);
    const done = await this.typeLines(lines, hwnd, TEXT_DELAY_MS, signal);
    if (done < lines.length)
      return failed(
        `stopped after ${done} of ${lines.length} lines because the window changed`,
      );
    return ok(`typed ${lines.length} line${lines.length === 1 ? "" : "s"}`);
  }

  private async pressKeys(keys: string): Promise<string> {
    const hwnd = await this.typingTarget();
    if (hwnd === undefined) return failed("there is no app window in front");
    const vks = KEY_COMBOS[keys];
    if (!vks) return failed(`${keys} is not allowed`);
    return (await this.host.keys(vks, hwnd))
      ? ok(`pressed ${keys}`)
      : failed("the window changed");
  }

  private async writeCode(
    filename: string,
    code: string,
    signal: AbortSignal,
  ): Promise<string> {
    const exe = this.host.vsCodePath();
    if (!exe) return failed("VS Code was not found on this PC");
    const dir = path.join(this.host.documentsDir(), PROJECTS_FOLDER);
    this.host.mkdir(path.join(dir, ".vscode"));
    const settings = path.join(dir, ".vscode", "settings.json");
    // Lay Jarvis's typing settings over the folder's settings each time, so an
    // older or edited file still turns auto-indent off.
    const current = this.host.exists(settings)
      ? this.host.readFile(settings)
      : undefined;
    const merged = mergeWorkspaceSettings(current);
    if (merged && merged !== current) this.host.writeFile(settings, merged);
    const name = freeName(dir, filename, (file) => this.host.exists(file));
    const file = path.join(dir, name);
    this.host.writeFile(file, "");

    const before = (await this.host.foreground())?.hwnd;
    this.host.spawnDetached(exe, [dir, file]);
    const isEditor = (window: ForegroundWindow) =>
      (VSCODE_PROCESSES as readonly string[]).includes(window.process) &&
      window.title.includes(name);
    let window = await this.waitForNewWindow(before, signal, 8_000, isEditor);
    if (!window) {
      // VS Code may have opened behind another window.
      const hwnd = await this.host.find(VSCODE_PROCESSES);
      if (hwnd) await this.host.focus(hwnd);
      window = await this.waitForNewWindow(before, signal, 10_000, isEditor);
    }
    if (!window)
      return failed(
        `VS Code did not show ${name}, so nothing was typed. The empty file is in Documents\\${PROJECTS_FOLDER}`,
      );
    this.target = window.hwnd;
    await this.host.popUp(window.hwnd);
    await this.host.sleep(700, signal);

    const lines = codeLines(code);
    // Clear any indent VS Code adds after Enter; each line types its own.
    const done = await this.typeLines(
      lines,
      window.hwnd,
      CODE_DELAY_MS,
      signal,
      true,
    );
    if (done < lines.length) {
      return failed(
        `stopped after ${done} of ${lines.length} lines because VS Code was no longer in front`,
      );
    }
    await this.host.keys(KEY_COMBOS["ctrl+s"] ?? [], window.hwnd);
    return ok(
      `wrote ${name} (${lines.length} lines) in VS Code and saved it in Documents\\${PROJECTS_FOLDER}`,
    );
  }

  private async draftEmail(
    to: string,
    subject: string,
    body: string,
    signal: AbortSignal,
  ): Promise<string> {
    const before = (await this.host.foreground())?.hwnd;
    await this.host.openExternal(mailtoUrl(to, subject));
    const isOutlook = (window: ForegroundWindow) =>
      (OUTLOOK_PROCESSES as readonly string[]).includes(window.process);
    let window = await this.waitForNewWindow(before, signal, 20_000, isOutlook);
    if (!window) {
      const hwnd = await this.host.find(OUTLOOK_PROCESSES);
      if (hwnd) await this.host.focus(hwnd);
      window = await this.waitForNewWindow(before, signal, 5_000, isOutlook);
    }
    if (!window) {
      return failed(
        "the draft opened outside Outlook, with the recipient and subject filled in, so the message was not typed. Setting Outlook as the default email app fixes this",
      );
    }
    // The compose window can open a moment after Outlook itself. Prefer the one titled with the subject.
    if (subject && !window.title.includes(subject)) {
      const compose = await this.waitForNewWindow(
        before,
        signal,
        6_000,
        (next) => isOutlook(next) && next.title.includes(subject),
      );
      if (compose) window = compose;
    }
    this.target = window.hwnd;
    await this.host.popUp(window.hwnd);
    await this.host.sleep(1500, signal);
    const lines = textLines(body);
    const done = await this.typeLines(
      lines,
      window.hwnd,
      EMAIL_DELAY_MS,
      signal,
    );
    if (done < lines.length) {
      return failed(
        `stopped after ${done} of ${lines.length} lines because Outlook was no longer in front. The draft was not sent`,
      );
    }
    return ok(
      "the draft is ready in Outlook. It was not sent; the user reviews it and presses Send",
    );
  }
}
