import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { windowsPowershellPath } from "../discovery/start-apps";
import {
  parseWindowSnapshot,
  type WindowRect,
  type WindowSnapshot,
} from "../shared/launch-window";

/**
 * One Windows PowerShell helper for as long as Jarvis is visible.
 * Add-Type runs once, at start. SAMPLE emits one list. SERVE polls until
 * its deadline or a place file appears. It sets per-monitor v2 DPI awareness
 * before any GetWindowRect or SetWindowPos, so those calls use physical
 * pixels and Windows does not scale them a second time.
 * The C# is C# 5. It sits in a PowerShell single-quoted string, so it has
 * no character literals. It does not start, stop, or reconfigure explorer.exe.
 */
const HELPER_SOURCE = String.raw`
$ErrorActionPreference = 'Stop';
$ProgressPreference = 'SilentlyContinue';
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8;
Add-Type -TypeDefinition '
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class JarvisWindows {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr hWnd, uint cmd);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lp, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder lp, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr hwnd);
  [DllImport("user32.dll", EntryPoint="GetWindowLongW")] public static extern int GetWindowLong(IntPtr hWnd, int nIndex);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hwnd, int attr, out int value, int size);
  [DllImport("kernel32.dll")] public static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
  [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] public static extern bool QueryFullProcessImageName(IntPtr process, int flags, StringBuilder name, ref int size);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] public static extern int GetApplicationUserModelId(IntPtr process, ref int length, StringBuilder id);
  [DllImport("ntdll.dll")] public static extern int NtQueryInformationProcess(IntPtr handle, int infoClass, ref ProcessBasicInformation info, int length, out int returned);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct ProcessBasicInformation {
    public IntPtr Reserved1; public IntPtr PebBaseAddress; public IntPtr Reserved2_0; public IntPtr Reserved2_1;
    public IntPtr UniqueProcessId; public IntPtr InheritedFromUniqueProcessId;
  }
  static StringBuilder Rows;
  static bool FirstRow;
  static volatile bool PlaceRequested;
  static long PlaceHwnd;
  static int PlaceX;
  static int PlaceY;
  static int PlaceW;
  static int PlaceH;
  static void BecomeDpiAware() {
    try { SetThreadDpiAwarenessContext((IntPtr)(-4)); } catch { }
  }
  public static string List() {
    BecomeDpiAware();
    Rows = new StringBuilder();
    FirstRow = true;
    Rows.Append("{\"foreground\":");
    Rows.Append(GetForegroundWindow().ToInt64());
    Rows.Append(",\"windows\":[");
    EnumWindows(OnWindow, IntPtr.Zero);
    Rows.Append("]}");
    return Rows.ToString();
  }
  public static void EmitList() {
    try { Console.WriteLine(List()); Console.Out.Flush(); } catch { }
  }
  static bool OnWindow(IntPtr hwnd, IntPtr param) {
    if (!IsWindowVisible(hwnd)) return true;
    int style = GetWindowLong(hwnd, -20);
    if ((style & 128) != 0) return true;
    if (Cloaked(hwnd)) return true;
    RECT bounds;
    if (!GetWindowRect(hwnd, out bounds)) return true;
    int width = bounds.Right - bounds.Left;
    int height = bounds.Bottom - bounds.Top;
    if (width <= 0 || height <= 0) return true;
    uint pid;
    GetWindowThreadProcessId(hwnd, out pid);
    if (pid == 0) return true;
    bool iconic = IsIconic(hwnd);
    bool owned = GetWindow(hwnd, 4) != IntPtr.Zero;
    uint dpi = DpiOf(hwnd);
    string exe;
    string aumid;
    DescribeProcess(pid, out exe, out aumid);
    StringBuilder title = new StringBuilder(512);
    GetWindowText(hwnd, title, title.Capacity);
    StringBuilder className = new StringBuilder(256);
    GetClassName(hwnd, className, className.Capacity);
    if (!FirstRow) Rows.Append(",");
    FirstRow = false;
    Rows.Append("{\"hwnd\":");
    Rows.Append(hwnd.ToInt64());
    Rows.Append(",\"pid\":");
    Rows.Append(pid);
    Rows.Append(",\"ancestors\":");
    Rows.Append(Ancestors(pid));
    Rows.Append(",\"className\":");
    Rows.Append(Json(className.ToString()));
    Rows.Append(",\"title\":");
    Rows.Append(Json(title.ToString()));
    Rows.Append(",\"exe\":");
    Rows.Append(Json(exe));
    Rows.Append(",\"aumid\":");
    Rows.Append(Json(aumid));
    Rows.Append(",\"x\":");
    Rows.Append(bounds.Left);
    Rows.Append(",\"y\":");
    Rows.Append(bounds.Top);
    Rows.Append(",\"width\":");
    Rows.Append(width);
    Rows.Append(",\"height\":");
    Rows.Append(height);
    Rows.Append(",\"dpi\":");
    Rows.Append(dpi);
    Rows.Append(",\"iconic\":");
    Rows.Append(iconic ? "true" : "false");
    Rows.Append(",\"owned\":");
    Rows.Append(owned ? "true" : "false");
    Rows.Append("}");
    return true;
  }
  public static bool Place(long hwnd, int x, int y, int width, int height) {
    BecomeDpiAware();
    if (hwnd <= 0 || width <= 0 || height <= 0) return false;
    IntPtr handle = new IntPtr(hwnd);
    if (!IsWindow(handle)) return false;
    if (GetWindow(handle, 4) != IntPtr.Zero) return false;
    StringBuilder className = new StringBuilder(256);
    GetClassName(handle, className, className.Capacity);
    string name = className.ToString();
    if (name == "Progman" || name == "WorkerW" || name == "Shell_TrayWnd" || name == "Shell_SecondaryTrayWnd") return false;
    ShowWindow(handle, 9);
    System.Threading.Thread.Sleep(80);
    bool moved = SetWindowPos(handle, IntPtr.Zero, x, y, width, height, 64);
    SetForegroundWindow(handle);
    return moved;
  }
  public static bool ReadPlace(string path) {
    try {
      if (path == null || path.Length == 0 || !System.IO.File.Exists(path)) return false;
      string text = System.IO.File.ReadAllText(path).Trim();
      string[] parts = text.Split(new char[] { (char)32 });
      if (parts.Length != 6 || parts[0] != "PLACE") return false;
      long hwnd = long.Parse(parts[1]);
      int x = int.Parse(parts[2]);
      int y = int.Parse(parts[3]);
      int width = int.Parse(parts[4]);
      int height = int.Parse(parts[5]);
      if (hwnd <= 0 || width <= 0 || height <= 0) return false;
      PlaceHwnd = hwnd;
      PlaceX = x;
      PlaceY = y;
      PlaceW = width;
      PlaceH = height;
      PlaceRequested = true;
      try { System.IO.File.Delete(path); } catch { }
      return true;
    } catch { return false; }
  }
  public static void EmitResult() {
    bool ok = false;
    if (PlaceRequested) {
      PlaceRequested = false;
      ok = Place(PlaceHwnd, PlaceX, PlaceY, PlaceW, PlaceH);
    }
    Console.WriteLine(ok ? "{\"placed\":true}" : "{\"placed\":false}");
    Console.Out.Flush();
  }
  static uint DpiOf(IntPtr hwnd) {
    try {
      uint dpi = GetDpiForWindow(hwnd);
      if (dpi < 96) return 96;
      return dpi;
    } catch { return 96; }
  }
  static void DescribeProcess(uint pid, out string exe, out string aumid) {
    exe = "";
    aumid = "";
    IntPtr handle = OpenProcess(4096, false, pid);
    if (handle == IntPtr.Zero) return;
    try {
      exe = ExeOf(handle);
      aumid = AumidOf(handle);
    } catch {
      exe = "";
      aumid = "";
    } finally { CloseHandle(handle); }
  }
  static string ExeOf(IntPtr process) {
    try {
      int size = 1024;
      StringBuilder sb = new StringBuilder(size);
      if (!QueryFullProcessImageName(process, 0, sb, ref size)) return "";
      return sb.ToString();
    } catch { return ""; }
  }
  static string AumidOf(IntPtr process) {
    try {
      int length = 1024;
      StringBuilder sb = new StringBuilder(length);
      if (GetApplicationUserModelId(process, ref length, sb) != 0) return "";
      return sb.ToString();
    } catch { return ""; }
  }
  static bool Cloaked(IntPtr hwnd) {
    try {
      int value;
      int hr = DwmGetWindowAttribute(hwnd, 14, out value, 4);
      if (hr != 0) return false;
      return value != 0;
    } catch { return false; }
  }
  static uint ParentPid(uint pid) {
    IntPtr handle = OpenProcess(4096, false, pid);
    if (handle == IntPtr.Zero) return 0;
    try {
      ProcessBasicInformation info = new ProcessBasicInformation();
      int returned;
      int status = NtQueryInformationProcess(handle, 0, ref info, Marshal.SizeOf(typeof(ProcessBasicInformation)), out returned);
      if (status != 0) return 0;
      long parent = info.InheritedFromUniqueProcessId.ToInt64();
      if (parent <= 0 || parent > uint.MaxValue) return 0;
      return (uint)parent;
    } catch { return 0; }
    finally { CloseHandle(handle); }
  }
  static string Ancestors(uint pid) {
    StringBuilder sb = new StringBuilder();
    sb.Append("[");
    uint current = pid;
    uint[] seen = new uint[6];
    int count = 0;
    while (current != 0 && count < 6) {
      bool again = false;
      for (int i = 0; i < count; i++) { if (seen[i] == current) again = true; }
      if (again) break;
      if (count > 0) sb.Append(",");
      sb.Append(current);
      seen[count] = current;
      count++;
      current = ParentPid(current);
    }
    sb.Append("]");
    return sb.ToString();
  }
  static string Json(string value) {
    if (value == null) value = "";
    StringBuilder sb = new StringBuilder();
    sb.Append((char)34);
    for (int i = 0; i < value.Length; i++) {
      char c = value[i];
      if (c == 92 || c == 34) { sb.Append((char)92); sb.Append(c); }
      else if (c < 32) sb.Append((char)32);
      else sb.Append(c);
    }
    sb.Append((char)34);
    return sb.ToString();
  }
}
'
`;

export interface PlacementProcess {
  pid?: number;
  stdout: NodeJS.EventEmitter;
  kill(): void;
  on(event: "close", listener: () => void): void;
  on(event: "error", listener: (error: Error) => void): void;
}

export interface WindowWatch {
  nextSample(): Promise<WindowSnapshot | undefined>;
  place(hwnd: number, rect: WindowRect): Promise<boolean>;
  close(): void;
}

let watchSerial = 0;

/** One line, so execFile can pass it as a single argument with no shell. */
export function windowHelperScript(): string {
  return HELPER_SOURCE.replace(/\s+/g, " ").trim();
}

function psLiteral(value: string): string | undefined {
  if (value.includes("\0") || /[\r\n]/.test(value)) return undefined;
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * One long-lived process. Add-Type runs at start. SAMPLE emits one list.
 * SERVE <ms> polls until that deadline or a place file appears.
 */
export function windowSessionCommand(commandPath: string, placePath: string): string | undefined {
  const command = psLiteral(commandPath);
  const place = psLiteral(placePath);
  if (!command || !place) return undefined;
  return `${windowHelperScript()}; $cmdFile = ${command}; $placeFile = ${place}; while ($true) { if (-not (Test-Path -LiteralPath $cmdFile)) { Start-Sleep -Milliseconds 30; continue }; $text = ''; try { $fs = [System.IO.File]::Open($cmdFile, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None); $n = [int]$fs.Length; $buf = New-Object byte[] $n; [void]$fs.Read($buf, 0, $n); $text = [System.Text.Encoding]::UTF8.GetString($buf).Trim(); $fs.SetLength(0); $fs.Close() } catch { continue }; if ($text -eq '') { Start-Sleep -Milliseconds 30; continue }; if ($text -eq 'QUIT') { break }; if ($text -eq 'SAMPLE') { [JarvisWindows]::EmitList(); continue }; if ($text.StartsWith('SERVE ')) { $ms = 4000; try { $ms = [int]$text.Substring(6).Trim() } catch { $ms = 4000 }; if ($ms -lt 1) { continue }; $deadline = (Get-Date).AddMilliseconds($ms); while ((Get-Date) -lt $deadline) { [JarvisWindows]::EmitList(); if ([JarvisWindows]::ReadPlace($placeFile)) { break }; if (Test-Path -LiteralPath $cmdFile) { $peek = ''; try { $peek = [System.IO.File]::ReadAllText($cmdFile).Trim() } catch { $peek = '' }; if ($peek -eq 'QUIT') { break } }; Start-Sleep -Milliseconds 200 }; [JarvisWindows]::ReadPlace($placeFile) | Out-Null; [JarvisWindows]::EmitResult() } }`;
}

export function powershellArgs(command: string): string[] {
  return ["-NoProfile", "-NonInteractive", "-Command", command];
}

function defaultSpawn(file: string, args: string[]): PlacementProcess {
  return spawn(file, args, { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
}

/** Kill powershell and the csc child it spawned for Add-Type. */
function killProcessTree(child: PlacementProcess): void {
  const pid = child.pid;
  if (process.platform === "win32" && typeof pid === "number" && pid > 0) {
    const root = process.env.SystemRoot?.trim().replace(/[\\/]+$/, "") || "C:\\Windows";
    execFile(
      `${root}\\System32\\taskkill.exe`,
      ["/T", "/F", "/PID", String(pid)],
      { windowsHide: true, shell: false },
      () => {
        try {
          child.kill();
        } catch {
          // Already exited.
        }
      },
    );
    return;
  }
  try {
    child.kill();
  } catch {
    // Already exited.
  }
}

export interface WindowSessionOptions {
  platform: string;
  env?: NodeJS.ProcessEnv;
  spawnImpl?: (file: string, args: string[]) => PlacementProcess;
  commandPath?: string;
  placePath?: string;
  writeFile?: (filePath: string, text: string) => void;
}

const idleWatch = (): WindowWatch => ({
  nextSample: async () => undefined,
  place: async () => false,
  close: () => undefined,
});

export interface WindowSession {
  /** Compile once and wait for SAMPLE / SERVE commands. Safe to call again. */
  start(): void;
  /** Ask the process to exit. Kills the tree only if it is still running. */
  stop(): void;
  /** One fresh snapshot. Undefined if the helper has not produced one in time. */
  sample(timeoutMs: number): Promise<WindowSnapshot | undefined>;
  /** Poll and place on the same process. `close` does not kill it. */
  serve(timeoutMs: number): WindowWatch;
}

/**
 * One helper for as long as Jarvis is visible. Add-Type runs at start, not on each click.
 */
export function createWindowSession(options: WindowSessionOptions): WindowSession {
  const disabled = options.platform !== "win32";
  const ownsFiles = options.commandPath === undefined;
  const commandPath =
    options.commandPath ?? path.join(os.tmpdir(), `jarvis-cmd-${process.pid}-${++watchSerial}.txt`);
  const placePath = options.placePath ?? path.join(os.tmpdir(), `jarvis-place-${process.pid}-${watchSerial}.txt`);
  const writeFile =
    options.writeFile ??
    ((filePath: string, text: string) => {
      fs.writeFileSync(filePath, text, "utf8");
    });
  let child: PlacementProcess | undefined;
  let generation = 0;
  let ended = false;
  let stopRequested = false;
  let grace: ReturnType<typeof setTimeout> | undefined;
  let buffer = "";
  let ignoreSnapshot = false;
  let serveDone = false;
  let sampleWaiter: ((snap: WindowSnapshot | undefined) => void) | undefined;
  let placeWaiter: ((ok: boolean) => void) | undefined;
  const snapshots: WindowSnapshot[] = [];
  const sampleReaders: Array<(snap: WindowSnapshot | undefined) => void> = [];

  const writeCommand = (text: string) => {
    let last: unknown;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        writeFile(commandPath, text);
        return;
      } catch (error) {
        last = error;
      }
    }
    throw last;
  };

  const deliverSample = (snap: WindowSnapshot | undefined) => {
    const waiter = sampleReaders.shift();
    if (waiter) waiter(snap);
    else if (snap) snapshots.push(snap);
  };

  const finish = () => {
    if (ended) return;
    ended = true;
    if (grace) clearTimeout(grace);
    sampleWaiter?.(undefined);
    sampleWaiter = undefined;
    placeWaiter?.(false);
    placeWaiter = undefined;
    while (sampleReaders.length > 0) deliverSample(undefined);
  };

  const onSnapshot = (snap: WindowSnapshot) => {
    if (ignoreSnapshot) {
      ignoreSnapshot = false;
      return;
    }
    if (sampleWaiter) {
      const waiter = sampleWaiter;
      sampleWaiter = undefined;
      waiter(snap);
      return;
    }
    deliverSample(snap);
  };

  const onLine = (line: string) => {
    if (line.startsWith('{"placed":')) {
      serveDone = true;
      const ok = line.startsWith('{"placed":true');
      const waiter = placeWaiter;
      placeWaiter = undefined;
      waiter?.(ok);
      while (sampleReaders.length > 0) deliverSample(undefined);
      return;
    }
    if (!line.startsWith('{"foreground"')) return;
    const snap = parseWindowSnapshot(line);
    if (snap) onSnapshot(snap);
  };

  const takeBuffer = (chunk: Buffer | string) => {
    buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    let nl = buffer.indexOf("\n");
    while (nl >= 0) {
      onLine(buffer.slice(0, nl).replace(/\r$/, "").trim());
      buffer = buffer.slice(nl + 1);
      nl = buffer.indexOf("\n");
    }
  };

  return {
    start() {
      if (disabled) return;
      if (child && !ended && !stopRequested) return;
      if (grace) clearTimeout(grace);
      if (child && !ended) killProcessTree(child);
      const generationId = ++generation;
      ended = false;
      stopRequested = false;
      buffer = "";
      const command = windowSessionCommand(commandPath, placePath);
      if (!command) return;
      try {
        const spawnImpl = options.spawnImpl ?? defaultSpawn;
        child = spawnImpl(windowsPowershellPath(options.env?.SystemRoot), powershellArgs(command));
      } catch {
        child = undefined;
        ended = true;
        return;
      }
      const current = child;
      current.stdout.on("data", (chunk) => {
        if (generationId === generation) takeBuffer(chunk);
      });
      current.on("error", () => {
        if (generationId === generation) finish();
      });
      current.on("close", () => {
        if (generationId !== generation) return;
        if (buffer.trim()) onLine(buffer.trim());
        buffer = "";
        finish();
      });
    },
    stop() {
      if (disabled) return;
      if (!child || ended) return;
      if (stopRequested) return;
      stopRequested = true;
      try {
        writeCommand("QUIT");
      } catch {
        // The process may already be gone.
      }
      const current = child;
      grace = setTimeout(() => {
        if (!ended) killProcessTree(current);
      }, 400);
    },
    sample(timeoutMs: number) {
      if (disabled || !child || ended) return Promise.resolve(undefined);
      try {
        writeCommand("SAMPLE");
      } catch {
        return Promise.resolve(undefined);
      }
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          if (sampleWaiter) {
            sampleWaiter = undefined;
            ignoreSnapshot = true;
            resolve(undefined);
          }
        }, timeoutMs);
        sampleWaiter = (snap) => {
          clearTimeout(timer);
          resolve(snap);
        };
      });
    },
    serve(timeoutMs: number) {
      if (disabled || !child || ended || !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) return idleWatch();
      ignoreSnapshot = false;
      serveDone = false;
      snapshots.splice(0);
      try {
        if (ownsFiles) fs.rmSync(placePath, { force: true });
      } catch {
        // No previous place request.
      }
      try {
        writeCommand(`SERVE ${timeoutMs}`);
      } catch {
        return idleWatch();
      }
      const deadlineAt = Date.now() + timeoutMs + 8_000;
      return {
        async nextSample() {
          if (snapshots.length > 0) return snapshots.shift();
          if (serveDone || ended) return undefined;
          return new Promise((resolve) => {
            const waiter = (snap: WindowSnapshot | undefined) => {
              clearTimeout(timer);
              resolve(snap);
            };
            const timer = setTimeout(() => {
              const index = sampleReaders.indexOf(waiter);
              if (index >= 0) sampleReaders.splice(index, 1);
              serveDone = true;
              resolve(undefined);
            }, Math.max(0, deadlineAt - Date.now()));
            sampleReaders.push(waiter);
          });
        },
        async place(hwnd, rect) {
          if (!Number.isSafeInteger(hwnd) || hwnd <= 0) return false;
          if (![rect.x, rect.y, rect.width, rect.height].every((value) => Number.isSafeInteger(value))) return false;
          if (rect.width <= 0 || rect.height <= 0) return false;
          return new Promise((resolve) => {
            placeWaiter = resolve;
            try {
              writeFile(placePath, `PLACE ${hwnd} ${rect.x} ${rect.y} ${rect.width} ${rect.height}`);
            } catch {
              if (placeWaiter === resolve) placeWaiter = undefined;
              resolve(false);
            }
          });
        },
        close() {
          // The helper stays up for the next click. Hiding Jarvis stops it.
        },
      };
    },
  };
}

