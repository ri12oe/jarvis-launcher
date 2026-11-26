// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../src/renderer/App";
import type { JarvisBridge, LauncherState, LauncherTileView, SystemStats, VoiceSnapshot } from "../src/shared/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const tile = (id: string, label: string): LauncherTileView => ({ id, label, kind: "app" });

const state: LauncherState = {
  hotkey: "CommandOrControl+Alt+J",
  platform: "win32",
  tiles: [
    tile("claude", "Claude"),
    tile("copilot", "Copilot"),
    tile("edge", "Microsoft Edge"),
    tile("explorer", "File Explorer"),
    tile("x", "X"),
    ...Array.from({ length: 10 }, (_, index) => tile(`extra-${index}`, `Extra ${index}`)),
  ],
  warnings: [],
  scanning: false,
  refreshFailed: false,
};

const voice: VoiceSnapshot = {
  hasKey: false,
  enabled: false,
  capture: false,
  phase: "idle",
  heard: "",
  reply: "",
  error: "",
  launchError: "",
};

const stats: SystemStats = {
  cpuPct: 41,
  ramUsedBytes: 3.5 * 1024 ** 3,
  ramFreeBytes: 500 * 1024 ** 2,
  ramTotalBytes: 4 * 1024 ** 3,
  diskPct: 50,
  uptimeSec: 3300,
  wifi: { signalPct: 88, ssid: "HomeNet" },
  net: null,
  recycle: { items: 0, bytes: 0 },
  weather: null,
};

describe("MARIO OS HUD", () => {
  let root: Root | undefined;
  let host: HTMLDivElement | undefined;
  let launched: string[] = [];

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    delete (window as { jarvis?: JarvisBridge }).jarvis;
  });

  async function render(): Promise<HTMLDivElement> {
    launched = [];
    const bridge: JarvisBridge = {
      getState: async () => state,
      onState: () => () => undefined,
      onHidden: () => () => undefined,
      launch: async (id) => {
        launched.push(id);
        return { ok: true };
      },
      refresh: async () => undefined,
      hide: () => undefined,
      quit: () => undefined,
      getVoice: async () => voice,
      onVoice: () => () => undefined,
      setVoiceEnabled: async () => undefined,
      pushAudio: () => undefined,
      onSpeak: () => () => undefined,
      playbackEnded: () => undefined,
      reportVoiceError: () => undefined,
      getStats: async () => stats,
      getSystem: async () => null,
      systemAction: async () => ({ ok: true }),
      webSearch: async () => ({ ok: true }),
      openConfig: async () => ({ ok: true }),
      getSettings: async () => null,
      saveSettings: async () => ({ ok: true }),
      findPlace: async () => ({ ok: true, places: [] }),
      talk: async () => ({ ok: true }),
    };
    (window as { jarvis?: JarvisBridge }).jarvis = bridge;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(<App />);
      await Promise.resolve();
      await Promise.resolve();
    });
    return host;
  }

  const key = async (value: string) => {
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true }));
    });
  };

  it("draws the design text, the live readings, and the extra tiles on the ring", async () => {
    const view = await render();
    const tabs = [...view.querySelectorAll(".tab .slot-text")].map((node) => node.textContent);
    expect(tabs).toEqual(["Claude", "Copiiolt", "Grok", "Gemmi", "V3 Code", "Mircosoft Doc"]);
    const left = [...view.querySelectorAll(".launcher .slot-text")].map((node) => node.textContent);
    expect(left).toEqual(["Microsoft Edge", "File Explorer", "Spoftiy", "Outlook", "GitHub", "x"]);
    expect(view.querySelector(".tab")?.getAttribute("aria-label")).toBe("Claude");
    expect(view.querySelectorAll(".plate-btn")).toHaveLength(8);
    expect(view.querySelector(".wifi-text")?.textContent).toBe("wifi: 88%");
    expect(view.querySelector(".core-value")?.textContent).toBe("41");
    expect(view.querySelector(".uptime")?.textContent).toBe("0d 0h 55m");
    expect(view.querySelector(".launcher.active")?.getAttribute("aria-label")).toBe("Microsoft Edge");
  });

  it("launches a filled slot and reports a missing app in the status bar", async () => {
    const view = await render();
    const tabs = view.querySelectorAll<HTMLButtonElement>(".tab");
    await act(async () => {
      tabs[1].click();
    });
    expect(launched).toEqual(["copilot"]);
    const spotify = view.querySelectorAll<HTMLButtonElement>(".launcher")[2];
    await act(async () => {
      spotify.click();
    });
    expect(view.querySelector(".status")?.textContent).toBe("LAUNCH FAILED  Spotify not found");
    expect(launched).toEqual(["copilot"]);
  });

  it("filters by typing, launches with Enter, and pages the ring", async () => {
    const view = await render();
    await key("c");
    await key("o");
    await key("p");
    expect(view.querySelector(".status")?.textContent).toBe("FILTER  COP");
    const dim = [...view.querySelectorAll(".tab.dim")].map((node) => node.getAttribute("aria-label"));
    expect(dim).toContain("Claude");
    expect(view.querySelector(".tab.active")?.getAttribute("aria-label")).toBe("Copilot");
    await key("Enter");
    expect(launched).toEqual(["copilot"]);
    await key("Escape");
    expect(view.querySelector(".status")?.textContent).toBe("ID-6TH / AM");

    const before = [...view.querySelectorAll(".plate-label")].map((node) => node.textContent);
    await key("PageDown");
    const after = [...view.querySelectorAll(".plate-label")].map((node) => node.textContent);
    expect(before[0]).toBe("Extra 0");
    expect(after).toEqual(["Extra 8", "Extra 9"]);
  });
});
