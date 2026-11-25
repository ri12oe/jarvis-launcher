// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../src/renderer/App";
import { layoutHud, nextRingTile } from "../src/shared/ring";
import type { JarvisBridge, LaunchResult, LauncherState, LauncherTileView } from "../src/shared/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const tiles: LauncherTileView[] = [
  { id: "chatgpt", label: "ChatGPT", kind: "app" },
  { id: "claude", label: "Claude", kind: "app" },
  { id: "cursor", label: "Cursor", kind: "app" },
  { id: "grok", label: "Grok", kind: "app" },
  { id: "edge", label: "Microsoft Edge", kind: "app" },
  { id: "explorer", label: "File Explorer", kind: "system" },
  { id: "desktop", label: "Desktop", kind: "folder" },
  { id: "documents", label: "Documents", kind: "folder" },
  { id: "downloads", label: "Downloads", kind: "folder" },
  { id: "pictures", label: "Pictures", kind: "folder" },
];

describe("HUD ring", () => {
  let root: Root | undefined;
  let host: HTMLDivElement | undefined;
  let pending: Array<(result: LaunchResult) => void>;
  let launched: string[];

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    delete (window as { jarvis?: JarvisBridge }).jarvis;
  });

  async function renderApp(): Promise<void> {
    pending = [];
    launched = [];
    const state: LauncherState = {
      hotkey: "CommandOrControl+Alt+J",
      platform: "win32",
      tiles,
      warnings: [],
      scanning: false,
      refreshFailed: false,
    };
    const bridge: JarvisBridge = {
      getState: async () => state,
      onState: () => () => undefined,
      onHidden: () => () => undefined,
      launch: (id: string) => {
        launched.push(id);
        return new Promise((resolve) => {
          pending.push(resolve);
        });
      },
      refresh: async () => undefined,
      hide: () => undefined,
      quit: () => undefined,
      getVoice: async () => ({
        hasKey: false,
        enabled: false,
        capture: false,
        phase: "idle" as const,
        heard: "",
        reply: "",
        error: "",
        launchError: "",
      }),
      onVoice: () => () => undefined,
      setVoiceEnabled: async () => undefined,
      pushAudio: () => undefined,
      onSpeak: () => () => undefined,
      playbackEnded: () => undefined,
      reportVoiceError: () => undefined,
    };
    (window as { jarvis?: JarvisBridge }).jarvis = bridge;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(<App />);
      await Promise.resolve();
    });
  }

  function footer(): string {
    return host?.querySelector(".bottom .hint")?.textContent ?? "";
  }

  function press(key: string): void {
    window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  }

  it("keeps a static voice mark and splits a full list onto two rings", async () => {
    await renderApp();
    const voice = host?.querySelector("[data-voice]");
    expect(voice?.getAttribute("data-voice")).toBe("standby");
    expect(voice?.tagName).not.toBe("BUTTON");
    expect(host?.querySelectorAll(".orbit").length).toBeGreaterThan(0);
    expect(host?.querySelectorAll(".tile")).toHaveLength(tiles.length);
    expect(footer()).toBe("SELECT A SYSTEM");
  });

  it("moves the active segment clockwise around its ring", async () => {
    await renderApp();
    const layout = layoutHud(tiles, { width: window.innerWidth, height: window.innerHeight });
    const visible = layout.segments.filter((segment) => segment.page === layout.segments[0]?.page);
    const next = nextRingTile(0, visible, "ArrowRight");
    const buttons = () => [...(host?.querySelectorAll(".tile") ?? [])];
    expect(buttons()[0]?.classList.contains("active")).toBe(true);

    await act(async () => {
      press("ArrowRight");
    });
    const active = host?.querySelector(".tile.active");
    expect(active?.textContent?.toUpperCase()).toContain(tiles[next]?.label.toUpperCase());
    expect(document.activeElement).toBe(active);
    expect(buttons()[0]?.classList.contains("active")).toBe(next === 0);
  });

  it("highlights matches, dims the rest, and does not launch a dimmed segment", async () => {
    await renderApp();
    await act(async () => {
      for (const key of ["e", "d", "g", "e"]) press(key);
    });
    expect(footer()).toBe("FILTER  EDGE");

    const lit = [...(host?.querySelectorAll(".tile.lit") ?? [])];
    const dim = [...(host?.querySelectorAll(".tile.dim") ?? [])];
    expect(lit.map((node) => node.textContent?.replace(/\s+/g, ""))).toEqual(["EDGE"]);
    expect(lit[0]?.getAttribute("aria-label")).toBe("Microsoft Edge");
    expect(dim).toHaveLength(tiles.length - 1);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Microsoft Edge");

    await act(async () => {
      dim[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(pending).toHaveLength(0);

    await act(async () => {
      lit[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(pending).toHaveLength(1);

    await act(async () => {
      press("Escape");
    });
    expect(footer()).toBe("SELECT A SYSTEM");
    expect(host?.querySelectorAll(".tile.dim")).toHaveLength(0);
    expect(host?.querySelectorAll(".tile.lit")).toHaveLength(0);

    await act(async () => {
      for (const key of ["z", "z", "z"]) press(key);
    });
    expect(footer()).toBe("NO MATCH");
  });

  it("launches Edge, File Explorer, and a folder, and leaves the power buttons dead", async () => {
    await renderApp();
    const power = [...(host?.querySelectorAll<HTMLButtonElement>(".sys-btn") ?? [])];
    expect(power.map((button) => button.textContent)).toEqual(["DOWNT", "RESTRT", "HIBER", "LOGOUT", "LOCK"]);
    for (const button of power) {
      expect(button.disabled).toBe(true);
      await act(async () => {
        button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    }
    expect(launched).toEqual([]);
    expect(host?.querySelector(".search-pill input, .media input")).toBeNull();

    for (const label of ["Microsoft Edge", "File Explorer", "Desktop"]) {
      const button = [...(host?.querySelectorAll(".tile") ?? [])].find((node) => node.getAttribute("aria-label") === label);
      await act(async () => {
        button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    }
    expect(launched).toEqual(["edge", "explorer", "desktop"]);
  });
});
