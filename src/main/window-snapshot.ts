import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { windowsPowershellPath } from "../discovery/start-apps";
import { parseWindowSnapshot, type WindowRect, type WindowSnapshot } from "../shared/launch-window";

const execFileAsync = promisify(execFile);

/**
 * Windows PowerShell helper. It only reads top-level windows and calls
 * ShowWindow(SW_RESTORE) plus SetWindowPos on one hwnd. It does not start,
 * stop, or reconfigure explorer.exe, and it does not write registry keys.
 * The C# is C# 5 so Windows PowerShell 5.1 can compile it. No char literals:
 * the source sits inside a PowerShell single-quoted string.
 */
const HELPER_SOURCE = String.raw`
$ErrorActionPreference = 'Stop';
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
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lp, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder lp, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll", EntryPoint="GetWindowLongW")] public static extern int GetWindowLong(IntPtr hWnd, int nIndex);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hwnd, int attr, out int value, int size);
  [DllImport("kernel32.dll")] public static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
  [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr handle);
  [DllImport("ntdll.dll")] public static extern int NtQueryInformationProcess(IntPtr handle, int infoClass, ref ProcessBasicInformation info, int length, out int returned);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct ProcessBasicInformation {
    public IntPtr Reserved1; public IntPtr PebBaseAddress; public IntPtr Reserved2_0; public IntPtr Reserved2_1;
    public IntPtr UniqueProcessId; public IntPtr InheritedFromUniqueProcessId;
  }
  static StringBuilder Rows;
  static bool FirstRow;
  public static string List() {
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
    Rows.Append(",\"width\":");
    Rows.Append(width);
    Rows.Append(",\"height\":");
    Rows.Append(height);
    Rows.Append(",\"iconic\":");
    Rows.Append(iconic ? "true" : "false");
    Rows.Append("}");
    return true;
  }
  public static bool Place(long hwnd, int x, int y, int width, int height) {
    if (hwnd <= 0 || width <= 0 || height <= 0) return false;
    IntPtr handle = new IntPtr(hwnd);
    if (!IsWindow(handle)) return false;
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

const RUN_OPTIONS: WindowRunOptions = {
  encoding: "utf8",
  windowsHide: true,
  timeout: 5_000,
  maxBuffer: 2 * 1024 * 1024,
  shell: false,
};

/** One line, so execFile can pass it as a single argument with no shell. */
export function windowHelperScript(): string {
  return HELPER_SOURCE.replace(/\s+/g, " ").trim();
}

export function windowListCommand(): string {
  return `${windowHelperScript()}; [JarvisWindows]::List()`;
}

/** Integers only. Anything else is refused before it can reach PowerShell. */
export function windowPlaceCommand(hwnd: number, rect: WindowRect): string | undefined {
  const values = [hwnd, rect.x, rect.y, rect.width, rect.height];
  if (!values.every((value) => Number.isSafeInteger(value))) return undefined;
  if (hwnd <= 0 || rect.width <= 0 || rect.height <= 0) return undefined;
  return `${windowHelperScript()}; if ([JarvisWindows]::Place(${hwnd}, ${rect.x}, ${rect.y}, ${rect.width}, ${rect.height})) { '{"ok":true}' } else { '{"ok":false}' }`;
}

export function powershellArgs(command: string): string[] {
  return ["-NoProfile", "-NonInteractive", "-Command", command];
}

const runPowerShell: WindowRunner = async (file, args, options) => {
  const { stdout } = await execFileAsync(file, args, options);
  return { stdout: String(stdout) };
};

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

export async function placeTopLevelWindow(
  platform: string,
  env: NodeJS.ProcessEnv,
  hwnd: number,
  rect: WindowRect,
  run: WindowRunner = runPowerShell,
): Promise<boolean> {
  if (platform !== "win32") return false;
  const command = windowPlaceCommand(hwnd, rect);
  if (!command) return false;
  try {
    const { stdout } = await run(windowsPowershellPath(env.SystemRoot), powershellArgs(command), {
      ...RUN_OPTIONS,
      shell: false,
    });
    return stdout.includes('{"ok":true}');
  } catch {
    return false;
  }
}
