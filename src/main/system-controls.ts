import {
  execFile,
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import path from "node:path";
import { windowsPowershellPath } from "../discovery/start-apps";
import {
  EMPTY_SYSTEM,
  parseHelperReply,
  parseSystemState,
  type SystemAction,
  type SystemState,
} from "../shared/system";

/**
 * One Windows PowerShell process for volume, mic mute, brightness, sleep, and
 * the Windows media session. Commands are `<id> <op> <number>` lines on stdin.
 * Replies are one JSON line each. It exits on QUIT or when stdin closes, which
 * happens when Jarvis exits.
 *
 * The whole script is collapsed to one line, so every statement ends in a
 * semicolon and there are no comments in it. The C# sits in a single-quoted
 * PowerShell string, so it has no single quotes. It is C# 5.
 *
 * Volume uses the Core Audio endpoint (IAudioEndpointVolume). Brightness uses
 * WmiMonitorBrightnessMethods, which laptops and some all-in-ones support and
 * most desktop monitors do not. Media uses
 * GlobalSystemMediaTransportControlsSessionManager, the same session the
 * Windows volume flyout shows. With no session, the media buttons fall back to
 * the media keys.
 */
const HELPER_SOURCE = String.raw`
$ErrorActionPreference = 'Stop';
$ProgressPreference = 'SilentlyContinue';
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false;
Add-Type -TypeDefinition '
using System;
using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IJarvisEndpointVolume {
  int f(); int g(); int h(); int i();
  int SetMasterVolumeLevelScalar(float level, Guid context);
  int j();
  int GetMasterVolumeLevelScalar(out float level);
  int k(); int l(); int m(); int n();
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, Guid context);
  int GetMute(out bool mute);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IJarvisDevice {
  int Activate(ref Guid id, int context, int parameters, out IJarvisEndpointVolume volume);
}
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IJarvisDeviceEnumerator {
  int f();
  int GetDefaultAudioEndpoint(int flow, int role, out IJarvisDevice endpoint);
}
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
class JarvisDeviceEnumerator { }
public static class JarvisAudio {
  static IJarvisEndpointVolume Endpoint(int flow) {
    try {
      IJarvisDeviceEnumerator devices = new JarvisDeviceEnumerator() as IJarvisDeviceEnumerator;
      IJarvisDevice device = null;
      int role = flow == 0 ? 1 : 0;
      if (devices.GetDefaultAudioEndpoint(flow, role, out device) != 0 || device == null) return null;
      IJarvisEndpointVolume volume = null;
      Guid id = typeof(IJarvisEndpointVolume).GUID;
      if (device.Activate(ref id, 23, 0, out volume) != 0) return null;
      return volume;
    } catch (Exception) { return null; }
  }
  public static int GetVolume() {
    IJarvisEndpointVolume v = Endpoint(0);
    if (v == null) return -1;
    float level;
    if (v.GetMasterVolumeLevelScalar(out level) != 0) return -1;
    return (int)Math.Round(level * 100);
  }
  public static void SetVolume(int percent) {
    IJarvisEndpointVolume v = Endpoint(0);
    if (v == null) return;
    int clamped = Math.Max(0, Math.Min(100, percent));
    v.SetMasterVolumeLevelScalar(clamped / 100f, Guid.Empty);
    if (clamped > 0) v.SetMute(false, Guid.Empty);
  }
  public static int GetMute(int flow) {
    IJarvisEndpointVolume v = Endpoint(flow);
    if (v == null) return -1;
    bool muted;
    if (v.GetMute(out muted) != 0) return -1;
    return muted ? 1 : 0;
  }
  public static void ToggleMute(int flow) {
    IJarvisEndpointVolume v = Endpoint(flow);
    if (v == null) return;
    bool muted;
    if (v.GetMute(out muted) != 0) return;
    v.SetMute(!muted, Guid.Empty);
  }
  [DllImport("shell32.dll", CharSet = CharSet.Unicode)] static extern int SHEmptyRecycleBin(IntPtr hwnd, string root, uint flags);
  public static void Calendar() {
    keybd_event(0x5B, 0, 1, UIntPtr.Zero);
    keybd_event(0x12, 0, 0, UIntPtr.Zero);
    keybd_event(0x44, 0, 0, UIntPtr.Zero);
    keybd_event(0x44, 0, 2, UIntPtr.Zero);
    keybd_event(0x12, 0, 2, UIntPtr.Zero);
    keybd_event(0x5B, 0, 3, UIntPtr.Zero);
  }
  public static void EmptyBin() {
    SHEmptyRecycleBin(IntPtr.Zero, null, 7);
  }
  [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  public static void MediaKey(int vk) {
    keybd_event((byte)vk, 0, 1, UIntPtr.Zero);
    keybd_event((byte)vk, 0, 3, UIntPtr.Zero);
  }
}
';
$script:asTask = $null;
$script:manager = $null;
$script:brightOk = $true;
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime;
  $script:asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -match '^IAsyncOperation.1$' } | Select-Object -First 1;
  $null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime];
} catch { $script:asTask = $null };
function Wait-Op($operation, [Type]$type) {
  $task = $script:asTask.MakeGenericMethod($type).Invoke($null, @($operation));
  if (-not $task.Wait(4000)) { throw 'timeout' };
  return $task.Result;
};
function Get-Session {
  if ($script:asTask -eq $null) { return $null };
  if ($script:manager -eq $null) {
    $managerType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager];
    $script:manager = Wait-Op ($managerType::RequestAsync()) $managerType;
  };
  return $script:manager.GetCurrentSession();
};
function Get-Media {
  $session = Get-Session;
  if ($session -eq $null) { return $null };
  $propsType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties];
  $props = Wait-Op ($session.TryGetMediaPropertiesAsync()) $propsType;
  $timeline = $session.GetTimelineProperties();
  $playback = $session.GetPlaybackInfo();
  return @{
    title = [string]$props.Title;
    artist = [string]$props.Artist;
    app = [string]$session.SourceAppUserModelId;
    status = [string]$playback.PlaybackStatus;
    position = $timeline.Position.TotalSeconds;
    duration = ($timeline.EndTime - $timeline.StartTime).TotalSeconds;
    updated = $timeline.LastUpdatedTime.ToUnixTimeMilliseconds()
  };
};
function Invoke-Media($name, $key) {
  $session = $null;
  try { $session = Get-Session } catch { $session = $null };
  if ($session -eq $null) { [JarvisAudio]::MediaKey($key); return };
  $op = $null;
  if ($name -eq 'prev') { $op = $session.TrySkipPreviousAsync() }
  elseif ($name -eq 'next') { $op = $session.TrySkipNextAsync() }
  else { $op = $session.TryTogglePlayPauseAsync() };
  $done = Wait-Op $op ([bool]);
  if (-not $done) { [JarvisAudio]::MediaKey($key) };
};
function Get-Brightness {
  if (-not $script:brightOk) { return -1 };
  try {
    $reading = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction Stop | Select-Object -First 1;
    if ($reading -eq $null) { $script:brightOk = $false; return -1 };
    return [int]$reading.CurrentBrightness;
  } catch { $script:brightOk = $false; return -1 };
};
function Set-Brightness($value) {
  if (-not $script:brightOk) { return };
  $methods = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods -ErrorAction Stop | Select-Object -First 1;
  if ($methods -ne $null) {
    $null = Invoke-CimMethod -InputObject $methods -MethodName WmiSetBrightness -Arguments @{ Timeout = [uint32]1; Brightness = [byte]$value };
  };
};
function Send-Reply($id, $ok, $data) {
  $json = @{ id = $id; ok = $ok; data = $data } | ConvertTo-Json -Compress -Depth 4;
  [Console]::Out.WriteLine($json);
  [Console]::Out.Flush();
};
while ($true) {
  $line = [Console]::In.ReadLine();
  if ($line -eq $null -or $line -eq 'QUIT') { break };
  $parts = $line.Split(' ');
  if ($parts.Length -lt 2) { continue };
  $id = [int]$parts[0];
  $op = $parts[1];
  $arg = 0;
  if ($parts.Length -gt 2) { $arg = [double]::Parse($parts[2], [System.Globalization.CultureInfo]::InvariantCulture) };
  try {
    $data = $null;
    if ($op -eq 'state') {
      $media = $null;
      try { $media = Get-Media } catch { $media = $null };
      $data = @{ volume = [JarvisAudio]::GetVolume(); muted = [JarvisAudio]::GetMute(0); mic = [JarvisAudio]::GetMute(1); brightness = Get-Brightness; media = $media };
    }
    elseif ($op -eq 'vol') { [JarvisAudio]::SetVolume([int]$arg) }
    elseif ($op -eq 'volstep') { $now = [JarvisAudio]::GetVolume(); if ($now -ge 0) { [JarvisAudio]::SetVolume($now + [int]$arg) } }
    elseif ($op -eq 'mute') { [JarvisAudio]::ToggleMute(0) }
    elseif ($op -eq 'mic') { [JarvisAudio]::ToggleMute(1) }
    elseif ($op -eq 'bright') { Set-Brightness ([int]$arg) }
    elseif ($op -eq 'prev') { Invoke-Media 'prev' 177 }
    elseif ($op -eq 'toggle') { Invoke-Media 'toggle' 179 }
    elseif ($op -eq 'next') { Invoke-Media 'next' 176 }
    elseif ($op -eq 'seek') {
      $session = Get-Session;
      if ($session -ne $null) { $null = Wait-Op ($session.TryChangePlaybackPositionAsync([int64]($arg * 10000000))) ([bool]) };
    }
    elseif ($op -eq 'emptybin') { [JarvisAudio]::EmptyBin() }
    elseif ($op -eq 'calendar') { Start-Sleep -Milliseconds 250; [JarvisAudio]::Calendar() }
    elseif ($op -eq 'sleep') {
      Add-Type -AssemblyName System.Windows.Forms;
      $null = [System.Windows.Forms.Application]::SetSuspendState([System.Windows.Forms.PowerState]::Suspend, $false, $false);
    }
    else { throw 'unknown op' };
    Send-Reply $id $true $data;
  } catch { Send-Reply $id $false ([string]$_.Exception.Message) };
};
`;

/** One line, so it can be passed as a single -Command argument with no shell. */
export function systemHelperScript(): string {
  return HELPER_SOURCE.replace(/\s+/g, " ").trim();
}

const HELPER_OP: Partial<Record<SystemAction, string>> = {
  sleep: "sleep",
  "media-prev": "prev",
  "media-toggle": "toggle",
  "media-next": "next",
  "media-seek": "seek",
  "volume-set": "vol",
  "volume-step": "volstep",
  "mute-toggle": "mute",
  "mic-toggle": "mic",
  "brightness-set": "bright",
  "empty-recyclebin": "emptybin",
  "open-calendar": "calendar",
};

const REQUEST_TIMEOUT_MS = 8000;
const STATE_MAX_AGE_MS = 900;

function system32(file: string): string {
  return path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", file);
}

function runFile(file: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { windowsHide: true, shell: false, timeout: 10_000 },
      (error) =>
        error ? reject(new Error(`${path.basename(file)} failed`)) : resolve(),
    );
  });
}

export class SystemControls {
  private child: ChildProcessWithoutNullStreams | null = null;
  private buffer = "";
  private nextId = 1;
  private pending = new Map<
    number,
    {
      resolve: (data: unknown) => void;
      reject: (error: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();
  private state: SystemState = EMPTY_SYSTEM;
  private stateAt = 0;
  private refreshing: Promise<SystemState> | null = null;
  private failures = 0;
  private readonly windows = process.platform === "win32";

  /** Last reading, refreshed in the background when it is older than about a second. */
  snapshot(): SystemState {
    if (Date.now() - this.stateAt > STATE_MAX_AGE_MS) void this.refresh();
    return this.state;
  }

  refresh(): Promise<SystemState> {
    if (!this.windows) return Promise.resolve(this.state);
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.request("state", 0)
      .then((data) => {
        this.state = parseSystemState(data);
        this.stateAt = Date.now();
        return this.state;
      })
      .catch(() => {
        this.stateAt = Date.now();
        return this.state;
      })
      .finally(() => {
        this.refreshing = null;
      });
    return this.refreshing;
  }

  /** Runs one checked action and returns the state after it. */
  async run(action: SystemAction, value: number): Promise<SystemState> {
    if (!this.windows) throw new Error("Only on Windows");
    if (action === "shutdown")
      await runFile(system32("shutdown.exe"), ["/s", "/t", "0"]);
    else if (action === "restart")
      await runFile(system32("shutdown.exe"), ["/r", "/t", "0"]);
    else if (action === "signout")
      await runFile(system32("shutdown.exe"), ["/l"]);
    else if (action === "lock")
      await runFile(system32("rundll32.exe"), ["user32.dll,LockWorkStation"]);
    else {
      const op = HELPER_OP[action];
      if (!op) throw new Error("Unknown action");
      await this.request(op, value);
    }
    this.stateAt = 0;
    return this.refresh();
  }

  stop(): void {
    const child = this.child;
    this.child = null;
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error("stopped"));
    }
    this.pending.clear();
    if (!child) return;
    try {
      child.stdin.write("QUIT\n");
      child.stdin.end();
    } catch {
      // Already gone.
    }
    setTimeout(() => {
      if (child.exitCode === null) child.kill();
    }, 2000).unref();
  }

  private start(): ChildProcessWithoutNullStreams | null {
    if (this.child) return this.child;
    if (this.failures >= 3) return null;
    const child = spawn(
      windowsPowershellPath(process.env.SystemRoot),
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        systemHelperScript(),
      ],
      { shell: false, windowsHide: true, stdio: ["pipe", "pipe", "ignore"] },
    ) as unknown as ChildProcessWithoutNullStreams;
    this.child = child;
    this.buffer = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => this.onData(chunk));
    const gone = () => {
      if (this.child !== child) return;
      this.child = null;
      this.failures++;
      for (const entry of this.pending.values()) {
        clearTimeout(entry.timer);
        entry.reject(new Error("system helper exited"));
      }
      this.pending.clear();
    };
    child.on("error", gone);
    child.on("close", gone);
    child.stdin.on("error", gone);
    return child;
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let newline = this.buffer.indexOf("\n");
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      newline = this.buffer.indexOf("\n");
      const reply = parseHelperReply(line);
      if (!reply) continue;
      const entry = this.pending.get(reply.id);
      if (!entry) continue;
      this.pending.delete(reply.id);
      clearTimeout(entry.timer);
      this.failures = 0;
      if (reply.ok) entry.resolve(reply.data);
      else
        entry.reject(
          new Error(
            typeof reply.data === "string" && reply.data
              ? reply.data
              : "System action failed",
          ),
        );
    }
  }

  private request(op: string, value: number): Promise<unknown> {
    const child = this.start();
    if (!child)
      return Promise.reject(new Error("System controls are unavailable"));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("System action timed out"));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      child.stdin.write(`${id} ${op} ${String(value)}\n`);
    });
  }
}
