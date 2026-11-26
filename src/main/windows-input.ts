import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { windowsPowershellPath } from "../discovery/start-apps";

/**
 * Types and presses keys for the voice assistant, through SendInput. One
 * PowerShell process stays open. Requests are JSON lines on stdin, replies are
 * JSON lines on stdout. Every request that sends input names the window it is
 * meant for, and the helper refuses when a different window is in front, so a
 * focus change can never send keystrokes somewhere unexpected.
 *
 * The script is collapsed to one line, so every statement ends in a semicolon.
 * The C# sits in a single-quoted PowerShell string, so it has no single quotes.
 * It is C# 5. Requests are sent as ASCII JSON, so the console encoding does
 * not matter.
 */
const INPUT_SOURCE = String.raw`
$ErrorActionPreference = 'Stop';
$ProgressPreference = 'SilentlyContinue';
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false;
Add-Type -TypeDefinition '
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
public static class JarvisInput {
  [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx; public int dy; public uint data; public uint flags; public uint time; public IntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort vk; public ushort scan; public uint flags; public uint time; public IntPtr extra; }
  [StructLayout(LayoutKind.Explicit)] struct UNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public UNION u; }
  [DllImport("user32.dll")] static extern uint SendInput(uint count, INPUT[] inputs, int size);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int max);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hwnd, int cmd);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hwnd);
  [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [StructLayout(LayoutKind.Sequential)] struct RECT { public int left; public int top; public int right; public int bottom; }
  [StructLayout(LayoutKind.Sequential)] struct APPBARDATA { public uint size; public IntPtr hwnd; public uint message; public uint edge; public RECT rc; public IntPtr param; }
  [DllImport("shell32.dll")] static extern UIntPtr SHAppBarMessage(uint message, ref APPBARDATA data);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindowW(string cls, string title);
  public static bool TaskbarAutoHide(bool on) {
    APPBARDATA data = new APPBARDATA();
    data.size = (uint)Marshal.SizeOf(typeof(APPBARDATA));
    data.hwnd = FindWindowW("Shell_TrayWnd", null);
    if (data.hwnd == IntPtr.Zero) return false;
    data.param = new IntPtr(on ? 1 : 2);
    SHAppBarMessage(10, ref data);
    return true;
  }
  static void Send(INPUT[] list) { SendInput((uint)list.Length, list, Marshal.SizeOf(typeof(INPUT))); }
  static INPUT Key(ushort vk, ushort scan, uint flags) {
    INPUT input = new INPUT();
    input.type = 1;
    input.u.ki.vk = vk;
    input.u.ki.scan = scan;
    input.u.ki.flags = flags;
    return input;
  }
  static bool Extended(int vk) { return (vk >= 0x21 && vk <= 0x28) || vk == 0x2D || vk == 0x2E || vk == 0x5B; }
  public static long Foreground() { return GetForegroundWindow().ToInt64(); }
  public static string Describe() {
    IntPtr hwnd = GetForegroundWindow();
    uint pid;
    GetWindowThreadProcessId(hwnd, out pid);
    string name = "";
    try { name = Process.GetProcessById((int)pid).ProcessName; } catch (Exception) { name = ""; }
    StringBuilder title = new StringBuilder(512);
    GetWindowText(hwnd, title, 512);
    return hwnd.ToInt64() + "|" + pid + "|" + name + "|" + title.ToString();
  }
  public static void Focus(long hwnd) {
    IntPtr handle = new IntPtr(hwnd);
    if (IsIconic(handle)) ShowWindow(handle, 9);
    keybd_event(0x12, 0, 0, UIntPtr.Zero);
    keybd_event(0x12, 0, 2, UIntPtr.Zero);
    SetForegroundWindow(handle);
  }
  public static long FindWindow(string names) {
    foreach (string name in names.Split(new char[] { (char)44 })) {
      foreach (Process process in Process.GetProcessesByName(name.Trim())) {
        if (process.MainWindowHandle != IntPtr.Zero) return process.MainWindowHandle.ToInt64();
      }
    }
    return 0;
  }
  public static bool TypeLine(string text, int delay, bool enter, long expect, bool clear) {
    foreach (char c in text) {
      if (expect != 0 && Foreground() != expect) return false;
      if (c == (char)9) Send(new INPUT[] { Key(0x09, 0, 0), Key(0x09, 0, 2) });
      else Send(new INPUT[] { Key(0, (ushort)c, 4), Key(0, (ushort)c, 6) });
      if (delay > 0) Thread.Sleep(delay);
    }
    if (enter) {
      if (expect != 0 && Foreground() != expect) return false;
      Send(new INPUT[] { Key(0x0D, 0, 0), Key(0x0D, 0, 2) });
      if (delay > 0) Thread.Sleep(delay * 2);
      if (clear) {
        Send(new INPUT[] { Key(0x10, 0, 0), Key(0x24, 0, 1), Key(0x24, 0, 3), Key(0x10, 0, 2) });
        if (delay > 0) Thread.Sleep(delay);
      }
    }
    return true;
  }
  public static bool Combo(string vks, long expect) {
    if (expect != 0 && Foreground() != expect) return false;
    string[] parts = vks.Split(new char[] { (char)44 });
    INPUT[] list = new INPUT[parts.Length * 2];
    for (int i = 0; i < parts.Length; i++) {
      int vk = int.Parse(parts[i]);
      uint flags = Extended(vk) ? 1u : 0u;
      list[i] = Key((ushort)vk, 0, flags);
      list[list.Length - 1 - i] = Key((ushort)vk, 0, flags | 2u);
    }
    Send(list);
    return true;
  }
}
';
while ($true) {
  $line = [Console]::In.ReadLine();
  if ($line -eq $null -or $line -eq 'QUIT') { break };
  $req = $null;
  try {
    $req = $line | ConvertFrom-Json;
    $data = $null;
    $ok = $true;
    if ($req.op -eq 'fg') { $data = [JarvisInput]::Describe() }
    elseif ($req.op -eq 'find') { $data = [string][JarvisInput]::FindWindow([string]$req.names) }
    elseif ($req.op -eq 'focus') { [JarvisInput]::Focus([long]$req.hwnd); Start-Sleep -Milliseconds 250; $data = [JarvisInput]::Describe() }
    elseif ($req.op -eq 'type') { $ok = [JarvisInput]::TypeLine([string]$req.text, [int]$req.delay, [bool]$req.enter, [long]$req.expect, [bool]$req.clear) }
    elseif ($req.op -eq 'taskbar') { $ok = [JarvisInput]::TaskbarAutoHide([bool]$req.on) }
    elseif ($req.op -eq 'keys') { $ok = [JarvisInput]::Combo([string]$req.vks, [long]$req.expect) }
    else { throw 'unknown op' };
    $json = @{ id = $req.id; ok = $ok; data = $data } | ConvertTo-Json -Compress;
  } catch {
    $id = $null;
    if ($req -ne $null) { $id = $req.id };
    $json = @{ id = $id; ok = $false; error = [string]$_.Exception.Message } | ConvertTo-Json -Compress;
  };
  [Console]::Out.WriteLine($json);
  [Console]::Out.Flush();
};
`;

/** One line, so it can be passed as a single -Command argument with no shell. */
export function inputHelperScript(): string {
  return INPUT_SOURCE.replace(/\s+/g, " ").trim();
}

/** JSON with every non-ASCII character escaped, so stdin encoding cannot garble it. */
export function inputRequestLine(request: Record<string, unknown>): string {
  return JSON.stringify(request).replace(
    /[\u007f-￿]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

export interface ForegroundWindow {
  hwnd: number;
  pid: number;
  process: string;
  title: string;
}

/** Reads `hwnd|pid|process|title` from the helper. */
export function parseForeground(data: unknown): ForegroundWindow | undefined {
  if (typeof data !== "string") return undefined;
  const [hwnd, pid, process, ...title] = data.split("|");
  const handle = Number(hwnd);
  const id = Number(pid);
  if (!Number.isFinite(handle) || !Number.isFinite(id)) return undefined;
  return {
    hwnd: handle,
    pid: id,
    process: process ?? "",
    title: title.join("|"),
  };
}

interface Reply {
  id?: unknown;
  ok?: unknown;
  data?: unknown;
}

const REQUEST_TIMEOUT_MS = 60_000;

export class WindowsInput {
  private child: ChildProcessWithoutNullStreams | null = null;
  private buffer = "";
  private nextId = 1;
  private pending = new Map<
    number,
    {
      resolve: (reply: Reply) => void;
      reject: (error: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();

  available(): boolean {
    return process.platform === "win32";
  }

  async foreground(): Promise<ForegroundWindow | undefined> {
    const reply = await this.request({ op: "fg" });
    return parseForeground(reply.data);
  }

  /** The main window of the first running process with one of these names, or 0. */
  async find(processNames: readonly string[]): Promise<number> {
    const reply = await this.request({
      op: "find",
      names: processNames.join(","),
    });
    const value = Number(reply.data);
    return Number.isFinite(value) ? value : 0;
  }

  async focus(hwnd: number): Promise<ForegroundWindow | undefined> {
    const reply = await this.request({ op: "focus", hwnd });
    return parseForeground(reply.data);
  }

  /**
   * Types one line into `expect`. False when another window came to the front.
   * With `clear`, Shift+Home after Enter selects any indent the editor added,
   * so the next line's own indent replaces it.
   */
  async typeLine(
    text: string,
    expect: number,
    enter: boolean,
    delayMs: number,
    clear = false,
  ): Promise<boolean> {
    const reply = await this.request({
      op: "type",
      text,
      expect,
      enter,
      delay: delayMs,
      clear,
    });
    return reply.ok === true;
  }

  /** Presses virtual keys together. False when another window came to the front. */
  async keys(vks: readonly number[], expect: number): Promise<boolean> {
    const reply = await this.request({
      op: "keys",
      vks: vks.join(","),
      expect,
    });
    return reply.ok === true;
  }

  /** Turn taskbar auto-hide on or off, the same setting as Settings > Personalization > Taskbar. */
  async taskbarAutoHide(on: boolean): Promise<boolean> {
    const reply = await this.request({ op: "taskbar", on });
    return reply.ok === true;
  }

  stop(): void {
    const child = this.child;
    this.child = null;
    if (child) {
      try {
        child.stdin.end("QUIT\n");
      } catch {
        child.kill();
      }
    }
    this.failAll(new Error("Keyboard helper stopped"));
  }

  private request(body: Record<string, unknown>): Promise<Reply> {
    if (!this.available())
      return Promise.reject(new Error("Computer control is only on Windows"));
    const child = this.ensure();
    if (!child)
      return Promise.reject(new Error("Keyboard helper did not start"));
    const id = this.nextId++;
    return new Promise<Reply>((resolve, reject) => {
      const timer = setTimeout(
        () => this.settle(id, new Error("Keyboard helper timed out")),
        REQUEST_TIMEOUT_MS,
      );
      this.pending.set(id, { resolve, reject, timer });
      child.stdin.write(`${inputRequestLine({ id, ...body })}\n`);
    });
  }

  private ensure(): ChildProcessWithoutNullStreams | null {
    if (this.child) return this.child;
    try {
      const child = spawn(
        windowsPowershellPath(process.env.SystemRoot),
        [
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          inputHelperScript(),
        ],
        { windowsHide: true, shell: false },
      );
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => this.read(chunk));
      child.stderr.on("data", () => undefined);
      child.on("error", () => this.lost(child));
      child.on("exit", () => this.lost(child));
      this.child = child;
      this.buffer = "";
      return child;
    } catch {
      return null;
    }
  }

  private read(chunk: string): void {
    this.buffer += chunk;
    let newline = this.buffer.indexOf("\n");
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line) {
        try {
          const reply = JSON.parse(line) as Reply;
          if (typeof reply.id === "number")
            this.settle(reply.id, undefined, reply);
        } catch {
          // Not a reply line.
        }
      }
      newline = this.buffer.indexOf("\n");
    }
  }

  private settle(id: number, error?: Error, reply?: Reply): void {
    const entry = this.pending.get(id);
    if (!entry) return;
    this.pending.delete(id);
    clearTimeout(entry.timer);
    if (reply) entry.resolve(reply);
    else entry.reject(error ?? new Error("Keyboard helper failed"));
  }

  private lost(child: ChildProcessWithoutNullStreams): void {
    if (this.child !== child) return;
    this.child = null;
    this.failAll(new Error("Keyboard helper exited"));
  }

  private failAll(error: Error): void {
    for (const id of [...this.pending.keys()]) this.settle(id, error);
  }
}
