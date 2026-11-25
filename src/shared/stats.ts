import type { WeatherConfig, WeatherDay, WeatherReport } from "./types";

/** `netsh wlan show interfaces`. Null when no wireless interface is connected. */
export function parseNetshWlan(text: string): { signalPct: number; ssid: string } | null {
  let signal: number | undefined;
  let ssid = "";
  let connected = false;
  for (const raw of text.split(/\r?\n/)) {
    const match = /^\s*([^:]+?)\s*:\s*(.*?)\s*$/.exec(raw);
    if (!match) continue;
    const key = match[1].toLowerCase();
    const value = match[2];
    if (key === "state") connected = /^connected$/i.test(value);
    else if (key === "ssid") ssid = value;
    else if (key === "signal") {
      const pct = Number.parseInt(value, 10);
      if (Number.isFinite(pct)) signal = Math.max(0, Math.min(100, pct));
    }
  }
  if (!connected || signal === undefined) return null;
  return { signalPct: signal, ssid };
}

/** `netstat -e`. Returns cumulative received and sent bytes. */
export function parseNetstatBytes(text: string): { received: number; sent: number } | null {
  for (const raw of text.split(/\r?\n/)) {
    const match = /^\s*Bytes\s+(\d+)\s+(\d+)\s*$/i.exec(raw);
    if (match) return { received: Number(match[1]), sent: Number(match[2]) };
  }
  return null;
}

/** Output of the recycle-bin PowerShell line: `<items> <bytes>`. */
export function parseRecycleLine(text: string): { items: number; bytes: number } | null {
  const match = /^\s*(\d+)\s+(\d+)\s*$/.exec(text.trim());
  if (!match) return null;
  return { items: Number(match[1]), bytes: Number(match[2]) };
}

export interface CpuSample {
  idle: number;
  total: number;
}

export function cpuSample(cpus: readonly { times: { user: number; nice: number; sys: number; idle: number; irq: number } }[]): CpuSample {
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    const t = cpu.times;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
  }
  return { idle, total };
}

export function cpuPercent(previous: CpuSample, next: CpuSample): number | null {
  const total = next.total - previous.total;
  if (total <= 0) return null;
  const busy = total - (next.idle - previous.idle);
  return Math.max(0, Math.min(100, Math.round((busy / total) * 100)));
}

/** `0d 0h 55m` */
export function formatUptime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
}

/** `3.5 GB`, `454.4 MB`, `12 KB` */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "--";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  if (unit === 0) return `${Math.round(value)} B`;
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** `8 KBps` style rate. */
export function formatRate(bytesPerSec: number): string {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec < 0) return "--";
  const kb = bytesPerSec / 1024;
  if (kb < 1000) return `${Math.round(kb)} KBps`;
  return `${(kb / 1024).toFixed(1)} MBps`;
}

/** WMO weather interpretation codes used by Open-Meteo. */
export function weatherCondition(code: number): string {
  if (code === 0) return "Clear";
  if (code === 1) return "Mostly Clear";
  if (code === 2) return "Partly Cloudy";
  if (code === 3) return "Cloudy";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 57) return "Drizzle";
  if (code >= 61 && code <= 67) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Showers";
  if (code === 85 || code === 86) return "Snow Showers";
  if (code >= 95) return "Thunderstorm";
  return "--";
}

export function openMeteoUrl(config: WeatherConfig): string {
  const params = new URLSearchParams({
    latitude: String(config.latitude),
    longitude: String(config.longitude),
    current:
      "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,surface_pressure,wind_speed_10m,visibility,uv_index",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset",
    temperature_unit: config.units,
    wind_speed_unit: config.units === "fahrenheit" ? "mph" : "kmh",
    precipitation_unit: config.units === "fahrenheit" ? "inch" : "mm",
    timezone: "auto",
    forecast_days: "3",
  });
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : Number.NaN;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** `2026-11-25T07:41` to `7:41 AM` */
export function clockFromIso(value: unknown): string {
  if (typeof value !== "string") return "--";
  const match = /T(\d{2}):(\d{2})/.exec(value);
  if (!match) return "--";
  const hour = Number(match[1]);
  const ap = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${match[2]} ${ap}`;
}

/** Open-Meteo forecast JSON to the HUD's report. Null when the payload is not usable. */
export function parseOpenMeteo(body: unknown, config: WeatherConfig): WeatherReport | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const current = record.current as Record<string, unknown> | undefined;
  const daily = record.daily as Record<string, unknown> | undefined;
  if (!current || !daily) return null;
  const temperature = num(current.temperature_2m);
  if (Number.isNaN(temperature)) return null;
  const dates = list(daily.time);
  const days: WeatherDay[] = dates.slice(0, 3).map((date, index) => ({
    date: typeof date === "string" ? date : "",
    high: Math.round(num(list(daily.temperature_2m_max)[index])),
    low: Math.round(num(list(daily.temperature_2m_min)[index])),
    condition: weatherCondition(num(list(daily.weather_code)[index])),
  }));
  return {
    label: config.label,
    units: config.units === "fahrenheit" ? "F" : "C",
    updated: typeof current.time === "string" ? current.time : "",
    temperature: Math.round(temperature),
    condition: weatherCondition(num(current.weather_code)),
    humidity: Math.round(num(current.relative_humidity_2m)),
    feelsLike: Math.round(num(current.apparent_temperature)),
    precipitation: num(current.precipitation),
    visibilityKm: num(current.visibility) / 1000,
    windSpeed: Math.round(num(current.wind_speed_10m)),
    windUnit: config.units === "fahrenheit" ? "mph" : "km/h",
    pressureHpa: Math.round(num(current.surface_pressure)),
    sunrise: clockFromIso(list(daily.sunrise)[0]),
    sunset: clockFromIso(list(daily.sunset)[0]),
    uvIndex: Math.round(num(current.uv_index) * 10) / 10,
    days,
  };
}
