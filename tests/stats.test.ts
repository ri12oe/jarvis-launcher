import { describe, expect, it } from "vitest";
import {
  clockFromIso,
  cpuPercent,
  formatBytes,
  formatRate,
  formatUptime,
  openMeteoUrl,
  parseNetshWlan,
  parseNetstatBytes,
  parseOpenMeteo,
  parseRecycleLine,
  weatherCondition,
} from "../src/shared/stats";

const NETSH = `
There is 1 interface on the system:

    Name                   : Wi-Fi
    Description            : Intel(R) Wi-Fi 6 AX201 160MHz
    State                  : connected
    SSID                   : HomeNet
    BSSID                  : aa:bb:cc:dd:ee:ff
    Radio type             : 802.11ax
    Signal                 : 88%
`;

describe("system stats parsers", () => {
  it("reads wifi signal and SSID, and returns null when disconnected", () => {
    expect(parseNetshWlan(NETSH)).toEqual({ signalPct: 88, ssid: "HomeNet" });
    expect(parseNetshWlan(NETSH.replace("connected", "disconnected"))).toBeNull();
    expect(parseNetshWlan("")).toBeNull();
  });

  it("reads netstat byte counters", () => {
    const text = "Interface Statistics\r\n\r\n                           Received            Sent\r\n\r\nBytes                    1234567          89012\r\nUnicast packets            1000           900\r\n";
    expect(parseNetstatBytes(text)).toEqual({ received: 1234567, sent: 89012 });
    expect(parseNetstatBytes("nothing")).toBeNull();
  });

  it("reads the recycle bin line", () => {
    expect(parseRecycleLine("3 104857600\r\n")).toEqual({ items: 3, bytes: 104857600 });
    expect(parseRecycleLine("0 0")).toEqual({ items: 0, bytes: 0 });
    expect(parseRecycleLine("error")).toBeNull();
  });

  it("computes CPU load from two samples", () => {
    expect(cpuPercent({ idle: 100, total: 200 }, { idle: 160, total: 300 })).toBe(40);
    expect(cpuPercent({ idle: 100, total: 200 }, { idle: 100, total: 200 })).toBeNull();
  });

  it("formats uptime, sizes, and rates", () => {
    expect(formatUptime(55 * 60 + 12)).toBe("0d 0h 55m");
    expect(formatUptime(2 * 86400 + 3 * 3600 + 4 * 60)).toBe("2d 3h 4m");
    expect(formatBytes(3.5 * 1024 ** 3)).toBe("3.5 GB");
    expect(formatBytes(454.4 * 1024 ** 2)).toBe("454 MB");
    expect(formatBytes(0)).toBe("0 B");
    expect(formatRate(8 * 1024)).toBe("8 KBps");
    expect(formatRate(5 * 1024 * 1024)).toBe("5.0 MBps");
  });

  it("maps Open-Meteo forecasts to the weather panel", () => {
    const config = { latitude: 39.77, longitude: -86.16, label: "Indianapolis, IN", units: "fahrenheit" as const };
    const url = new URL(openMeteoUrl(config));
    expect(url.host).toBe("api.open-meteo.com");
    expect(url.searchParams.get("latitude")).toBe("39.77");
    expect(url.searchParams.get("temperature_unit")).toBe("fahrenheit");
    const report = parseOpenMeteo(
      {
        current: {
          time: "2026-10-29T05:15",
          temperature_2m: 31.4,
          relative_humidity_2m: 77,
          apparent_temperature: 26.6,
          precipitation: 0,
          weather_code: 3,
          surface_pressure: 1017.2,
          wind_speed_10m: 1.2,
          visibility: 16000,
          uv_index: 0.04,
        },
        daily: {
          time: ["2026-10-29", "2026-10-30", "2026-10-31"],
          weather_code: [2, 2, 0],
          temperature_2m_max: [50.2, 57, 53],
          temperature_2m_min: [30, 23, 21],
          sunrise: ["2026-10-29T08:10", "", ""],
          sunset: ["2026-10-29T18:50", "", ""],
        },
      },
      config,
    );
    expect(report?.temperature).toBe(31);
    expect(report?.condition).toBe("Cloudy");
    expect(report?.units).toBe("F");
    expect(report?.sunrise).toBe("8:10 AM");
    expect(report?.sunset).toBe("6:50 PM");
    expect(report?.days.map((day) => [day.high, day.low, day.condition])).toEqual([
      [50, 30, "Partly Cloudy"],
      [57, 23, "Partly Cloudy"],
      [53, 21, "Clear"],
    ]);
    expect(parseOpenMeteo({}, config)).toBeNull();
    expect(clockFromIso("2026-10-29T00:05")).toBe("12:05 AM");
    expect(weatherCondition(95)).toBe("Thunderstorm");
  });
});
