import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  cpuPercent,
  cpuSample,
  openMeteoUrl,
  parseNetshWlan,
  parseNetstatBytes,
  parseOpenMeteo,
  parseRecycleLine,
  type CpuSample,
} from "../shared/stats";
import type {
  SystemStats,
  WeatherConfig,
  WeatherReport,
} from "../shared/types";

const FAST_MS = 2000;
const WIFI_MS = 10_000;
const RECYCLE_MS = 60_000;
const WEATHER_MS = 15 * 60_000;

/** Count and total size of the Recycle Bin. One line: `<items> <bytes>`. */
const RECYCLE_SCRIPT =
  "$i=@((New-Object -ComObject Shell.Application).NameSpace(10).Items());" +
  "$b=[int64](($i | Measure-Object -Property Size -Sum).Sum);" +
  'Write-Output "$($i.Count) $b"';

function system32(file: string): string {
  return path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", file);
}

function run(file: string, args: string[], timeout = 8000): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      { windowsHide: true, shell: false, timeout, maxBuffer: 256 * 1024 },
      (error, stdout) => {
        resolve(error ? "" : String(stdout));
      },
    );
  });
}

/**
 * Reads live numbers for the HUD on a timer. Nothing here writes to disk,
 * changes a setting, or sends data anywhere except the optional weather
 * request, which only carries the coordinates from config.json.
 */
export class StatsService {
  private timers: NodeJS.Timeout[] = [];
  private cpuPrev: CpuSample = cpuSample(os.cpus());
  private cpuPct: number | null = null;
  private diskPct: number | null = null;
  private wifi: SystemStats["wifi"] = null;
  private net: SystemStats["net"] = null;
  private netPrev: { received: number; sent: number; at: number } | null = null;
  private recycle: SystemStats["recycle"] = null;
  private weather: WeatherReport | null = null;
  private weatherConfig: WeatherConfig | undefined;
  private weatherKey = "";
  private readonly windows = process.platform === "win32";

  start(): void {
    if (this.timers.length > 0) return;
    void this.tickFast();
    void this.tickWifi();
    void this.tickRecycle();
    this.timers.push(setInterval(() => void this.tickFast(), FAST_MS));
    this.timers.push(setInterval(() => void this.tickWifi(), WIFI_MS));
    this.timers.push(setInterval(() => void this.tickRecycle(), RECYCLE_MS));
    this.timers.push(setInterval(() => void this.tickWeather(), WEATHER_MS));
  }

  stop(): void {
    for (const timer of this.timers) clearInterval(timer);
    this.timers = [];
  }

  /** Called on startup and whenever config.json is re-read. */
  setWeather(config: WeatherConfig | undefined): void {
    const key = config ? JSON.stringify(config) : "";
    if (key === this.weatherKey) return;
    this.weatherKey = key;
    this.weatherConfig = config;
    this.weather = null;
    void this.tickWeather();
  }

  snapshot(): SystemStats {
    return {
      cpuPct: this.cpuPct,
      ramUsedBytes: os.totalmem() - os.freemem(),
      ramFreeBytes: os.freemem(),
      ramTotalBytes: os.totalmem(),
      diskPct: this.diskPct,
      uptimeSec: os.uptime(),
      wifi: this.wifi,
      net: this.net,
      recycle: this.recycle,
      weather: this.weather,
    };
  }

  private async tickFast(): Promise<void> {
    const next = cpuSample(os.cpus());
    this.cpuPct = cpuPercent(this.cpuPrev, next) ?? this.cpuPct;
    this.cpuPrev = next;

    try {
      const root = this.windows ? `${process.env.SystemDrive ?? "C:"}\\` : "/";
      const info = await fs.promises.statfs(root);
      const total = info.blocks * info.bsize;
      const free = info.bavail * info.bsize;
      this.diskPct =
        total > 0 ? Math.round(((total - free) / total) * 100) : null;
    } catch {
      this.diskPct = null;
    }

    if (!this.windows) return;
    const bytes = parseNetstatBytes(await run(system32("NETSTAT.EXE"), ["-e"]));
    const at = Date.now();
    if (bytes && this.netPrev) {
      const seconds = (at - this.netPrev.at) / 1000;
      if (seconds > 0) {
        this.net = {
          downBytesPerSec: Math.max(
            0,
            (bytes.received - this.netPrev.received) / seconds,
          ),
          upBytesPerSec: Math.max(
            0,
            (bytes.sent - this.netPrev.sent) / seconds,
          ),
        };
      }
    }
    this.netPrev = bytes ? { ...bytes, at } : null;
  }

  private async tickWifi(): Promise<void> {
    if (!this.windows) return;
    this.wifi = parseNetshWlan(
      await run(system32("netsh.exe"), ["wlan", "show", "interfaces"]),
    );
  }

  private async tickRecycle(): Promise<void> {
    if (!this.windows) return;
    const powershell = system32(
      path.join("WindowsPowerShell", "v1.0", "powershell.exe"),
    );
    const out = await run(
      powershell,
      ["-NoProfile", "-NonInteractive", "-Command", RECYCLE_SCRIPT],
      15_000,
    );
    this.recycle = parseRecycleLine(out) ?? this.recycle;
  }

  private async tickWeather(): Promise<void> {
    const config = this.weatherConfig;
    if (!config) return;
    const key = this.weatherKey;
    try {
      const response = await fetch(openMeteoUrl(config), {
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) return;
      const report = parseOpenMeteo(await response.json(), config);
      if (report && key === this.weatherKey) this.weather = report;
    } catch {
      // Keep the last reading. The HUD shows "--" until the first one arrives.
    }
  }
}
