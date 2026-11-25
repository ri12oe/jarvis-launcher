// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../src/renderer/App";
import type { JarvisBridge, LauncherState, LauncherTileView, TileKind } from "../src/shared/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function tile(id: string, label: string, kind: TileKind = "app"): LauncherTileView {
  return { id, label, kind };
}

const tiles: LauncherTileView[] = [
  ...Array.from({ length: 8 }, (_, index) => tile(`item-${index}`, `Folder ${index} Documents`)),
  tile("zen-a", "Zen Alpha"),
  ...Array.from({ length: 6 }, (_, index) => tile(`mid-${index}`, `Project ${index} Workspace`)),
  tile("zen-b", "Zen Beta"),
  ...Array.from({ length: 4 }, (_, index) => tile(`extra-${index}`, `Notes ${index} Archive`)),
];

describe("HUD paging", () => {
  let root: Root | undefined;
  let host: HTMLDivElement | undefined;
  const previous = { width: window.innerWidth, height: window.innerHeight };

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    delete (window as { jarvis?: JarvisBridge }).jarvis;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: previous.width });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: previous.height });
  });

  async function renderApp(): Promise<void> {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 853 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 480 });
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
      launch: async () => ({ ok: true }),
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

  function press(key: string, target?: EventTarget): void {
    const event = new KeyboardEvent("keydown", { key, bubbles: true });
    if (target) Object.defineProperty(event, "target", { value: target });
    window.dispatchEvent(event);
  }

  function currentPage(): string {
    return host?.querySelector(".page-mark.current")?.textContent ?? "";
  }

  it("pages with PageDown and focuses a tile on the new page", async () => {
    await renderApp();
    expect(host?.querySelectorAll(".arc-btn").length).toBe(2);
    const before = currentPage();

    await act(async () => {
      press("PageDown");
    });

    expect(currentPage()).not.toBe(before);
    expect(document.activeElement?.classList.contains("tile")).toBe(true);
  });

  it("keeps focus on the arc button so Enter can page again", async () => {
    await renderApp();
    const next = host?.querySelector<HTMLButtonElement>(".arc-next");
    expect(next).toBeTruthy();
    const first = currentPage();

    await act(async () => {
      next?.focus();
      next?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(document.activeElement).toBe(next);

    await act(async () => {
      next?.click();
    });

    expect(document.activeElement).toBe(next);
    expect(currentPage()).not.toBe(first);

    const second = currentPage();
    await act(async () => {
      next?.click();
    });
    expect(document.activeElement).toBe(next);
    expect(currentPage()).not.toBe(second);
  });

  it("jumps to the matching page and highlights every page that still matches", async () => {
    await renderApp();
    await act(async () => {
      for (const key of ["z", "e", "n"]) press(key);
    });

    const hits = [...(host?.querySelectorAll(".page-mark.hit") ?? [])];
    expect(hits.length).toBeGreaterThan(0);
    expect(host?.querySelector(".page-mark.current")?.classList.contains("hit")).toBe(true);
    expect(host?.querySelector(".tile.active")?.getAttribute("aria-label")?.toUpperCase()).toContain("ZEN");
    expect(host?.querySelector(".bottom .hint")?.textContent).toBe("FILTER  ZEN");

    const page = currentPage();
    await act(async () => {
      press("Escape");
    });
    expect(currentPage()).toBe(page);
    expect(document.activeElement?.classList.contains("tile")).toBe(true);
    expect(host?.querySelector(".bottom .hint")?.textContent).toBe("SELECT A SYSTEM");
    expect(host?.querySelectorAll(".page-mark.hit")).toHaveLength(0);
  });
});
