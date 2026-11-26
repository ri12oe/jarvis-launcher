import { useEffect, useState } from "react";
import type { RecentItem } from "../../shared/recent";
import { EMPTY_SYSTEM, type SystemState } from "../../shared/system";
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

/** Sample media and volume for the Vite preview only. */
export function previewSystem(): SystemState {
  return {
    volume: 45,
    muted: false,
    micMuted: false,
    brightness: 70,
    media: {
      title: "Sample Track",
      artist: "Sample Artist",
      app: "Spotify.exe",
      status: "playing",
      position: 72,
      duration: 214,
      updatedMs: Date.now(),
    },
  };
}

/**
 * Volume, mute, brightness, and the playing track. Polls once a second.
 * `apply` takes the state an action returned, so the HUD updates at once.
 */
export function useSystem(): [SystemState, (next: SystemState) => void] {
  const [state, setState] = useState<SystemState>(() =>
    !window.jarvis && import.meta.env.DEV ? previewSystem() : EMPTY_SYSTEM,
  );
  useEffect(() => {
    const bridge = window.jarvis;
    if (!bridge) return;
    let cancelled = false;
    const poll = () => {
      void bridge
        .getSystem()
        .then((next) => {
          if (!cancelled && next) setState(next);
        })
        .catch(() => {});
    };
    poll();
    const timer = window.setInterval(poll, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);
  return [state, setState];
}

/** Re-renders every half second while something is playing, so the track time moves. */
export function useTicker(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [active]);
  return active ? now : Date.now();
}

/**
 * Recent files for the left list. Reads them when the page opens, whenever the
 * window gets focus (Jarvis was shown), and every 30 seconds.
 */
export function useRecent(enabled: boolean): RecentItem[] {
  const [items, setItems] = useState<RecentItem[]>(() =>
    !window.jarvis && import.meta.env.DEV && new URLSearchParams(window.location.search).get("recent") === "1"
      ? ["Resume.pdf", "Q3 budget.xlsx", "jarvis-launcher", "notes.txt", "Screenshot 2026-11-25.png", "Project brief.docx", "song.mp3", "README.md", "photo.jpg", "slides.pptx", "Downloads", "data.csv"].map(
          (name, index) => ({ id: String(index), name }),
        )
      : [],
  );
  useEffect(() => {
    const bridge = window.jarvis;
    if (!bridge || !enabled) return;
    let cancelled = false;
    const read = () => {
      void bridge
        .getRecent()
        .then((next) => {
          if (!cancelled) setItems(next);
        })
        .catch(() => {});
    };
    read();
    const timer = window.setInterval(read, 30_000);
    window.addEventListener("focus", read);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", read);
    };
  }, [enabled]);
  return items;
}
