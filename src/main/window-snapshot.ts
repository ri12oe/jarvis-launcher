import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { windowsPowershellPath } from "../discovery/start-apps";
import {
  parseWindowSnapshot,
  type WindowRect,
  type WindowSnapshot,
} from "../shared/launch-window";

const execFileAsync = promisify(execFile);

/**
 * One Windows PowerShell helper per launch. Add-Type runs once, then the
 * script polls until the deadline. It sets per-monitor v2 DPI awareness
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
      return true;
    } catch { return false; }
  }
  public static void EmitResult() {
    bool ok = false;
    if (PlaceRequested) ok = Place(PlaceHwnd, PlaceX, PlaceY, PlaceW, PlaceH);
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

export interface WindowRunOptions {
  encoding: "utf8";
  windowsHide: boolean;
  timeout: number;
  maxBuffer: number;
  shell: false;
}

export interface WindowRunner {
  (file: string, args: string[], options: WindowRunOptions): Promise<{ stdout: string }>;
}

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

const RUN_OPTIONS: WindowRunOptions = {
  encoding: "utf8",
  windowsHide: true,
  timeout: 20_000,
  maxBuffer: 4 * 1024 * 1024,
  shell: false,
};

let watchSerial = 0;

/** One line, so execFile can pass it as a single argument with no shell. */
export function windowHelperScript(): string {
  return HELPER_SOURCE.replace(/\s+/g, " ").trim();
}

export function windowListCommand(): string {
  return `${windowHelperScript()}; [JarvisWindows]::List()`;
}

function psLiteral(value: string): string | undefined {
  if (value.includes("\0") || /[\r\n]/.test(value)) return undefined;
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * One process polls until `timeoutMs`. Node writes the chosen hwnd to `signalPath`;
 * the script reads that file and calls SetWindowPos. PowerShell is not started again.
 */
export function windowServeCommand(timeoutMs: number, signalPath: string): string | undefined {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) return undefined;
  const quoted = psLiteral(signalPath);
  if (!quoted) return undefined;
  return `${windowHelperScript()}; $placeFile = ${quoted}; $deadline = (Get-Date).AddMilliseconds(${timeoutMs}); while ((Get-Date) -lt $deadline) { [JarvisWindows]::EmitList(); if ([JarvisWindows]::ReadPlace($placeFile)) { break }; Start-Sleep -Milliseconds 200 }; [JarvisWindows]::ReadPlace($placeFile) | Out-Null; [JarvisWindows]::EmitResult()`;
}

export function powershellArgs(command: string): string[] {
  return ["-NoProfile", "-NonInteractive", "-Command", command];
}

const runPowerShell: WindowRunner = async (file, args, options) => {
  const { stdout } = await execFileAsync(file, args, options);
  return { stdout: String(stdout) };
};

function defaultSpawn(file: string, args: string[]): PlacementProcess {
  return spawn(file, args, { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
}

export async function listTopLevelWindows(
  platform: string = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  run: WindowRunner = runPowerShell,
): Promise<WindowSnapshot | undefined> {
  if (platform !== "win32") return undefined;
  try {
    const { stdout } = await run(windowsPowershellPath(env.SystemRoot), powershellArgs(windowListCommand()), RUN_OPTIONS);
    return parseWindowSnapshot(stdout);
  } catch {
    return undefined;
  }
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

export interface WindowWatchOptions {
  platform: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs: number;
  spawnImpl?: (file: string, args: string[]) => PlacementProcess;
  signalPath?: string;
  writeSignal?: (filePath: string, text: string) => void;
}

const idleWatch = (): WindowWatch => ({
  nextSample: async () => undefined,
  place: async () => false,
  close: () => undefined,
});

/** Poll inside one helper process. `place` tells that same process which hwnd to move. */
export function startWindowWatch(options: WindowWatchOptions): WindowWatch {
  if (options.platform !== "win32") return idleWatch();
  const ownsFile = options.signalPath === undefined;
  const signalPath =
    options.signalPath ?? path.join(os.tmpdir(), `jarvis-place-${process.pid}-${++watchSerial}.txt`);
  const command = windowServeCommand(options.timeoutMs, signalPath);
  if (!command) return idleWatch();
  const writeSignal =
    options.writeSignal ??
    ((filePath: string, text: string) => {
      fs.writeFileSync(filePath, text, "utf8");
    });
  let child: PlacementProcess;
  try {
    const spawnImpl = options.spawnImpl ?? defaultSpawn;
    child = spawnImpl(windowsPowershellPath(options.env?.SystemRoot), powershellArgs(command));
  } catch {
    return idleWatch();
  }
  const lines: string[] = [];
  const waiters: Array<(line: string | undefined) => void> = [];
  let buffer = "";
  let ended = false;
  let closed = false;
  let sawSample = false;
  // Until the first sample, Add-Type may still be compiling. After that, the
  // poll itself lasts timeoutMs, so the fallback is only a short grace.
  let killTimer = setTimeout(() => killProcessTree(child), 12_000);
  const armKill = (delayMs: number) => {
    clearTimeout(killTimer);
    killTimer = setTimeout(() => killProcessTree(child), delayMs);
  };

  const pushLine = (line: string | undefined) => {
    const waiter = waiters.shift();
    if (waiter) waiter(line);
    else if (line !== undefined) lines.push(line);
  };
  const finish = () => {
    if (ended) return;
    ended = true;
    clearTimeout(killTimer);
    while (waiters.length > 0) pushLine(undefined);
  };
  const takeBuffer = (chunk: Buffer | string) => {
    buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    let nl = buffer.indexOf("\n");
    while (nl >= 0) {
      const line = buffer.slice(0, nl).replace(/\r$/, "").trim();
      if (!sawSample && line.startsWith('{"foreground"')) {
        sawSample = true;
        armKill(options.timeoutMs + 1_500);
      }
      pushLine(line);
      buffer = buffer.slice(nl + 1);
      nl = buffer.indexOf("\n");
    }
  };
  child.stdout.on("data", takeBuffer);
  child.on("error", () => finish());
  child.on("close", () => {
    if (buffer.trim()) pushLine(buffer.trim());
    buffer = "";
    finish();
  });

  const readLine = (): Promise<string | undefined> => {
    const queued = lines.shift();
    if (queued !== undefined) return Promise.resolve(queued);
    if (ended) return Promise.resolve(undefined);
    return new Promise((resolve) => waiters.push(resolve));
  };

  return {
    async nextSample() {
      while (true) {
        const line = await readLine();
        if (line === undefined) return undefined;
        if (!line.startsWith('{"foreground"')) continue;
        const snap = parseWindowSnapshot(line);
        if (snap) return snap;
      }
    },
    async place(hwnd, rect) {
      if (!Number.isSafeInteger(hwnd) || hwnd <= 0) return false;
      if (![rect.x, rect.y, rect.width, rect.height].every((value) => Number.isSafeInteger(value))) return false;
      if (rect.width <= 0 || rect.height <= 0) return false;
      try {
        writeSignal(signalPath, `PLACE ${hwnd} ${rect.x} ${rect.y} ${rect.width} ${rect.height}`);
      } catch {
        return false;
      }
      while (true) {
        const line = await readLine();
        if (line === undefined) return false;
        if (line.startsWith('{"placed":true')) return true;
        if (line.startsWith('{"placed":false')) return false;
      }
    },
    close() {
      if (closed) return;
      closed = true;
      clearTimeout(killTimer);
      killProcessTree(child);
      if (!ownsFile) return;
      try {
        fs.rmSync(signalPath, { force: true });
      } catch {
        // The signal file is only a hint to the helper.
      }
    },
  };
}

