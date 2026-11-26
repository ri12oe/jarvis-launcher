import { execFile, spawn } from "node:child_process";
import { windowsPowershellPath } from "../discovery/start-apps";
import {
  parseWindowSnapshot,
  type WindowRect,
  type WindowSnapshot,
} from "../shared/launch-window";

/**
 * One Windows PowerShell helper for the whole life of Jarvis.
 * Add-Type runs once, at process start. Commands arrive as lines on stdin
 * and results leave as JSON lines on stdout. Idle waits on stdin. The process
 * exits on stdin EOF or when the parent pid is gone.
 * It sets per-monitor v2 DPI awareness before any GetWindowRect or SetWindowPos,
 * so those calls use physical pixels and Windows does not scale them a second time.
 * The C# is C# 5. It sits in a PowerShell single-quoted string, so it has
 * no character literals. It does not start, stop, or reconfigure explorer.exe.
 */
const HELPER_SOURCE = String.raw`
$ErrorActionPreference = 'Stop';
$ProgressPreference = 'SilentlyContinue';
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8;
Add-Type -TypeDefinition '
using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Threading;
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
  [DllImport("kernel32.dll")] public static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
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
  static readonly object Gate = new object();
  static readonly Queue<string> Pending = new Queue<string>();
  static bool StdinEof;
  static int OwnerPid;
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
  public static void Run(int parentPid) {
    BecomeDpiAware();
    if (parentPid > 0) {
      OwnerPid = parentPid;
      Thread watcher = new Thread(WatchParent);
      watcher.IsBackground = true;
      watcher.Start();
    }
    Thread reader = new Thread(ReadStdin);
    reader.IsBackground = true;
    reader.Start();
    while (true) {
      string line = Take();
      if (line == null) return;
      if (!Dispatch(line)) return;
    }
  }
  static void WatchParent() {
    try {
      IntPtr handle = OpenProcess(1048576, false, (uint)OwnerPid);
      if (handle == IntPtr.Zero) return;
      uint waited = WaitForSingleObject(handle, 4294967295);
      CloseHandle(handle);
      if (waited != 0) return;
    } catch { return; }
    Environment.Exit(0);
  }
  static void ReadStdin() {
    try {
      StreamReader reader = new StreamReader(Console.OpenStandardInput(), Encoding.UTF8);
      string line;
      while ((line = reader.ReadLine()) != null) {
        string trimmed = line.Trim();
        if (trimmed.Length == 0) continue;
        lock (Gate) {
          Pending.Enqueue(trimmed);
          Monitor.Pulse(Gate);
        }
      }
    } catch { }
    lock (Gate) {
      StdinEof = true;
      Monitor.PulseAll(Gate);
    }
  }
  static string Take() {
    lock (Gate) {
      while (Pending.Count == 0 && !StdinEof) Monitor.Wait(Gate);
      if (Pending.Count == 0) return null;
      return Pending.Dequeue();
    }
  }
  static string Poll(int ms) {
    lock (Gate) {
      if (Pending.Count == 0 && !StdinEof) Monitor.Wait(Gate, ms);
      if (Pending.Count == 0) return null;
      return Pending.Dequeue();
    }
  }
  static void RequeueFront(string line) {
    lock (Gate) {
      string[] rest = new string[Pending.Count];
      int count = 0;
      while (Pending.Count > 0) { rest[count] = Pending.Dequeue(); count++; }
      Pending.Enqueue(line);
      for (int i = 0; i < count; i++) Pending.Enqueue(rest[i]);
      Monitor.Pulse(Gate);
    }
  }
  static bool Dispatch(string line) {
    if (line == "QUIT") return false;
    if (line.StartsWith("SAMPLE ")) { Sample(line); return true; }
    if (line.StartsWith("SERVE ")) { Serve(line); return true; }
    return true;
  }
  static void Sample(string line) {
    int id;
    if (!int.TryParse(line.Substring(7).Trim(), out id)) return;
    if (id <= 0) return;
    EmitList(id);
  }
  static void Serve(string line) {
    string rest = line.Substring(6).Trim();
    int space = rest.IndexOf((char)32);
    if (space < 1) return;
    int id;
    int ms;
    if (!int.TryParse(rest.Substring(0, space), out id)) return;
    if (!int.TryParse(rest.Substring(space + 1).Trim(), out ms)) return;
    if (id <= 0 || ms < 1) return;
    DateTime deadline = DateTime.UtcNow.AddMilliseconds(ms);
    while (DateTime.UtcNow < deadline) {
      EmitList(id);
      int left = (int)(deadline - DateTime.UtcNow).TotalMilliseconds;
      if (left < 1) break;
      int slice = 200;
      if (left < slice) slice = left;
      string next = Poll(slice);
      if (next == null) {
        if (StdinEof) { EmitPlaced(id, false); return; }
        continue;
      }
      if (next == "QUIT") { EmitPlaced(id, false); Environment.Exit(0); return; }
      if (next.StartsWith("PLACE ")) {
        bool moved;
        if (TryApplyPlace(next, id, out moved)) { EmitPlaced(id, moved); return; }
        continue;
      }
      EmitPlaced(id, false);
      RequeueFront(next);
      return;
    }
    EmitPlaced(id, false);
  }
  static bool TryApplyPlace(string line, int serveId, out bool moved) {
    moved = false;
    string rest = line.Substring(6).Trim();
    string[] parts = rest.Split(new char[] { (char)32 });
    if (parts.Length != 6) return false;
    int id;
    long hwnd;
    int x;
    int y;
    int width;
    int height;
    if (!int.TryParse(parts[0], out id)) return false;
    if (id != serveId) return false;
    if (!long.TryParse(parts[1], out hwnd)) return false;
    if (!int.TryParse(parts[2], out x)) return false;
    if (!int.TryParse(parts[3], out y)) return false;
    if (!int.TryParse(parts[4], out width)) return false;
    if (!int.TryParse(parts[5], out height)) return false;
    moved = Place(hwnd, x, y, width, height);
    return true;
  }
  static void EmitList(int id) {
    try {
      string body = List();
      if (body.Length < 2 || body[0] != (char)123) return;
      Console.Write("{\"id\":");
      Console.Write(id);
      Console.Write(",");
      Console.WriteLine(body.Substring(1));
      Console.Out.Flush();
    } catch { }
  }
  static void EmitPlaced(int id, bool ok) {
    try {
      Console.Write("{\"id\":");
      Console.Write(id);
      Console.Write(",\"placed\":");
      Console.Write(ok ? "true" : "false");
      Console.WriteLine("}");
      Console.Out.Flush();
    } catch { }
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
  stdin: {
    write(chunk: string): void;
    end(): void;
    on?(event: "error", listener: (error: Error) => void): void;
  };
  stdout: NodeJS.EventEmitter;
  kill(): void;
  on(event: "close", listener: (code: number | null) => void): void;
  on(event: "error", listener: (error: Error) => void): void;
}

export interface WindowWatch {
  nextSample(): Promise<WindowSnapshot | undefined>;
  place(hwnd: number, rect: WindowRect): Promise<boolean>;
  close(): void;
}

/** One line, so execFile can pass it as a single argument with no shell. */
export function windowHelperScript(): string {
  return HELPER_SOURCE.replace(/\s+/g, " ").trim();
}

/**
 * The helper blocks on stdin. SAMPLE <id> prints one list.
 * SERVE <id> <ms> prints lists until PLACE <id> ... or the deadline, then prints placed.
 * QUIT and stdin EOF both end the process. A command that arrives during SERVE is kept
 * and run next, after the in-flight serve reports that it placed nothing.
 */
export function windowSessionCommand(parentPid: number): string | undefined {
  if (!Number.isSafeInteger(parentPid) || parentPid < 0) return undefined;
  return `${windowHelperScript()}; [JarvisWindows]::Run(${parentPid})`;
}

export function powershellArgs(command: string): string[] {
  return ["-NoProfile", "-NonInteractive", "-Command", command];
}

function defaultSpawn(file: string, args: string[]): PlacementProcess {
  const child = spawn(file, args, {
    shell: false,
    windowsHide: true,
    stdio: ["pipe", "pipe", "ignore"],
  });
  if (!child.stdin || !child.stdout) {
    child.kill();
    throw new Error("window helper stdio was not piped");
  }
  return child as unknown as PlacementProcess;
}

/** Kill powershell and the csc child it spawned for Add-Type. */
function killProcessTree(child: PlacementProcess): void {
  const pid = child.pid;
  if (process.platform === "win32" && typeof pid === "number" && pid > 0) {
    const root =
      process.env.SystemRoot?.trim().replace(/[\\/]+$/, "") || "C:\\Windows";
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
  parentPid?: number;
  spawnImpl?: (file: string, args: string[]) => PlacementProcess;
}

const idleWatch = (): WindowWatch => ({
  nextSample: async () => undefined,
  place: async () => false,
  close: () => undefined,
});

interface ServeState {
  id: number;
  snapshots: WindowSnapshot[];
  readers: Array<(snap: WindowSnapshot | undefined) => void>;
  placeWaiter?: (ok: boolean) => void;
  done: boolean;
}

export interface WindowSession {
  /** Compile once and wait on stdin. Safe to call again. */
  start(): void;
  /** QUIT plus stdin EOF. Kills the tree only if it has not already exited. */
  stop(): Promise<number | null>;
  /** One fresh snapshot. Undefined if the helper has not produced one in time. */
  sample(timeoutMs: number): Promise<WindowSnapshot | undefined>;
  /** Poll and place on the same process. `close` does not kill it. */
  serve(timeoutMs: number): WindowWatch;
}

function lineId(line: string): { id?: number; placed?: boolean } {
  try {
    const value = JSON.parse(line) as { id?: unknown; placed?: unknown };
    const id =
      typeof value.id === "number" && Number.isSafeInteger(value.id)
        ? value.id
        : undefined;
    const placed = typeof value.placed === "boolean" ? value.placed : undefined;
    return { id, placed };
  } catch {
    return {};
  }
}

/**
 * One helper for as long as Jarvis is running. Add-Type runs at start, not on each click.
 */
export function createWindowSession(
  options: WindowSessionOptions,
): WindowSession {
  const disabled = options.platform !== "win32";
  const parentPid = options.parentPid ?? process.pid;
  let child: PlacementProcess | undefined;
  let generation = 0;
  let ended = false;
  let exitCode: number | null = null;
  let stopRequested = false;
  let grace: ReturnType<typeof setTimeout> | undefined;
  let buffer = "";
  let nextId = 1;
  let activeServe: ServeState | undefined;
  const sampleWaiters = new Map<
    number,
    (snap: WindowSnapshot | undefined) => void
  >();

  const writeLine = (text: string) => {
    const current = child;
    if (!current || ended) throw new Error("window helper is not running");
    current.stdin.write(`${text}\n`);
  };

  const finishServe = (serve: ServeState, placed: boolean | undefined) => {
    if (serve.done) return;
    serve.done = true;
    const waiter = serve.placeWaiter;
    serve.placeWaiter = undefined;
    if (placed !== undefined) waiter?.(placed);
    else waiter?.(false);
    while (serve.readers.length > 0) serve.readers.shift()?.(undefined);
  };

  const finish = (code: number | null) => {
    if (ended) return;
    ended = true;
    exitCode = code;
    if (grace) clearTimeout(grace);
    for (const waiter of sampleWaiters.values()) waiter(undefined);
    sampleWaiters.clear();
    if (activeServe) finishServe(activeServe, undefined);
  };

  const onLine = (line: string) => {
    const header = lineId(line);
    if (
      header.placed !== undefined &&
      header.id !== undefined &&
      activeServe &&
      header.id === activeServe.id
    ) {
      finishServe(activeServe, header.placed);
      return;
    }
    if (header.id === undefined) return;
    const snap = parseWindowSnapshot(line);
    if (!snap) return;
    const sampleWaiter = sampleWaiters.get(header.id);
    if (sampleWaiter) {
      sampleWaiters.delete(header.id);
      sampleWaiter(snap);
      return;
    }
    if (activeServe && header.id === activeServe.id && !activeServe.done) {
      const reader = activeServe.readers.shift();
      if (reader) reader(snap);
      else activeServe.snapshots.push(snap);
    }
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
      exitCode = null;
      stopRequested = false;
      buffer = "";
      const command = windowSessionCommand(parentPid);
      if (!command) return;
      try {
        const spawnImpl = options.spawnImpl ?? defaultSpawn;
        child = spawnImpl(
          windowsPowershellPath(options.env?.SystemRoot),
          powershellArgs(command),
        );
      } catch {
        child = undefined;
        ended = true;
        return;
      }
      const current = child;
      current.stdout.on("data", (chunk) => {
        if (generationId === generation) takeBuffer(chunk);
      });
      current.stdin.on?.("error", () => {
        if (generationId === generation) finish(exitCode);
      });
      current.on("error", () => {
        if (generationId === generation) finish(exitCode);
      });
      current.on("close", (code) => {
        if (generationId !== generation) return;
        if (buffer.trim()) onLine(buffer.trim());
        buffer = "";
        finish(code);
      });
    },
    stop() {
      if (disabled || !child || ended) return Promise.resolve(exitCode);
      if (stopRequested) return Promise.resolve(exitCode);
      stopRequested = true;
      const current = child;
      try {
        current.stdin.write("QUIT\n");
        current.stdin.end();
      } catch {
        // The process may already be gone.
      }
      if (!ended) {
        grace = setTimeout(() => {
          if (!ended) killProcessTree(current);
        }, 400);
      }
      return new Promise((resolve) => {
        const done = () => resolve(exitCode);
        if (ended) {
          done();
          return;
        }
        current.on("close", () => done());
      });
    },
    sample(timeoutMs: number) {
      if (
        disabled ||
        !child ||
        ended ||
        !Number.isSafeInteger(timeoutMs) ||
        timeoutMs <= 0
      ) {
        return Promise.resolve(undefined);
      }
      const id = nextId++;
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          if (!sampleWaiters.has(id)) return;
          sampleWaiters.delete(id);
          resolve(undefined);
        }, timeoutMs);
        sampleWaiters.set(id, (snap) => {
          clearTimeout(timer);
          resolve(snap);
        });
        try {
          writeLine(`SAMPLE ${id}`);
        } catch {
          clearTimeout(timer);
          sampleWaiters.delete(id);
          resolve(undefined);
        }
      });
    },
    serve(timeoutMs: number) {
      if (
        disabled ||
        !child ||
        ended ||
        !Number.isSafeInteger(timeoutMs) ||
        timeoutMs <= 0
      )
        return idleWatch();
      if (activeServe && !activeServe.done) finishServe(activeServe, undefined);
      const id = nextId++;
      const serve: ServeState = { id, snapshots: [], readers: [], done: false };
      activeServe = serve;
      try {
        writeLine(`SERVE ${id} ${timeoutMs}`);
      } catch {
        serve.done = true;
        return idleWatch();
      }
      return {
        async nextSample() {
          if (serve.snapshots.length > 0) return serve.snapshots.shift();
          if (serve.done || ended) return undefined;
          return new Promise((resolve) => {
            serve.readers.push(resolve);
          });
        },
        async place(hwnd, rect) {
          if (!Number.isSafeInteger(hwnd) || hwnd <= 0) return false;
          if (
            ![rect.x, rect.y, rect.width, rect.height].every((value) =>
              Number.isSafeInteger(value),
            )
          )
            return false;
          if (rect.width <= 0 || rect.height <= 0) return false;
          if (serve.done || ended) return false;
          return new Promise((resolve) => {
            serve.placeWaiter = resolve;
            try {
              writeLine(
                `PLACE ${id} ${hwnd} ${rect.x} ${rect.y} ${rect.width} ${rect.height}`,
              );
            } catch {
              if (serve.placeWaiter === resolve) serve.placeWaiter = undefined;
              resolve(false);
            }
          });
        },
        close() {
          // The helper stays up for the next click. Quitting Jarvis stops it.
        },
      };
    },
  };
}
