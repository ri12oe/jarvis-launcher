import { useEffect, useState } from "react";
import type { SystemStats } from "../../shared/types";

export interface Battery {
  level: number;
  charging: boolean;
}

interface BatteryManagerLike extends EventTarget {
  level: number;
  charging: boolean;
}

/** Sample readings for the Vite preview only, so the layout can be checked against the design. */
export function previewStats(): SystemStats {
  return {
    cpuPct: 41,
    ramUsedBytes: 3.5 * 1024 ** 3,
    ramFreeBytes: 454.4 * 1024 ** 2,
    ramTotalBytes: 4 * 1024 ** 3,
    diskPct: 62,
    uptimeSec: 55 * 60,
    wifi: { signalPct: 88, ssid: "mnoatioesb" },
    net: { downBytesPerSec: 8 * 1024, upBytesPerSec: 3 * 1024 },
    recycle: { items: 0, bytes: 0 },
    weather: {
      label: "Indianapolis, IN",
      units: "F",
      updated: "2026-10-29T05:23",
      temperature: 31,
      condition: "Cloudy",
      humidity: 77,
      feelsLike: 27,
      precipitation: 0,
      visibilityKm: 16,
      windSpeed: 1,
      windUnit: "mph",
      pressureHpa: 1017,
      sunrise: "7:10 AM",
      sunset: "5:50 PM",
      uvIndex: 1,
      days: [
        { date: "2026-10-29", high: 50, low: 30, condition: "Partly Cloudy" },
        { date: "2026-10-30", high: 57, low: 23, condition: "Partly Cloudy" },
        { date: "2026-10-31", high: 53, low: 21, condition: "Sunny" },
      ],
    },
  };
}

const HISTORY = 24;

export interface LiveStats {
  stats: SystemStats | null;
  down: number[];
  up: number[];
}

/** Polls the main process every two seconds while the window is open. */
export function useStats(): LiveStats {
  const [live, setLive] = useState<LiveStats>(() => ({
    stats: !window.jarvis && import.meta.env.DEV ? previewStats() : null,
    down: [],
    up: [],
  }));
  useEffect(() => {
    const bridge = window.jarvis;
    if (!bridge) return;
    let cancelled = false;
    const poll = () => {
      void bridge
        .getStats()
        .then((stats) => {
          if (cancelled || !stats) return;
          setLive((current) => ({
            stats,
            down: [...current.down, stats.net?.downBytesPerSec ?? 0].slice(-HISTORY),
            up: [...current.up, stats.net?.upBytesPerSec ?? 0].slice(-HISTORY),
          }));
        })
        .catch(() => {});
    };
    poll();
    const timer = window.setInterval(poll, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);
  return live;
}

export function useBattery(): Battery | null {
  const [battery, setBattery] = useState<Battery | null>(null);
  useEffect(() => {
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryManagerLike> };
    if (!nav.getBattery) return;
    let manager: BatteryManagerLike | null = null;
    const update = () => {
      if (manager) setBattery({ level: manager.level, charging: manager.charging });
    };
    void nav
      .getBattery()
      .then((found) => {
        manager = found;
        update();
        found.addEventListener("levelchange", update);
        found.addEventListener("chargingchange", update);
      })
      .catch(() => {});
    return () => {
      manager?.removeEventListener("levelchange", update);
      manager?.removeEventListener("chargingchange", update);
    };
  }, []);
  return battery;
}
