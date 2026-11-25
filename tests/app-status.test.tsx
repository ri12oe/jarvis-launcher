// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../src/renderer/App";
import type { JarvisBridge, LaunchResult, LauncherState, VoiceSnapshot } from "../src/shared/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const voiceSnapshot: VoiceSnapshot = {
  hasKey: false,
  enabled: false,
  capture: false,
  phase: "idle",
  heard: "",
  reply: "",
  error: "",
  launchError: "",
};

const state: LauncherState = {
  hotkey: "CommandOrControl+Alt+J",
  platform: "win32",
  tiles: [{ id: "edge", label: "Microsoft Edge", kind: "app" }],
  warnings: [],
  scanning: false,
  refreshFailed: false,
};

describe("App launch status", () => {
  let root: Root | undefined;
  let host: HTMLDivElement | undefined;
  let hidden: (() => void) | undefined;
  let pending: Array<(result: LaunchResult) => void>;

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    delete (window as { jarvis?: JarvisBridge }).jarvis;
  });

  async function renderApp(): Promise<void> {
    pending = [];
    hidden = undefined;
    const bridge: JarvisBridge = {
      getState: async () => state,
      onState: () => () => undefined,
      onHidden: (listener) => {
        hidden = listener;
        return () => {
          if (hidden === listener) hidden = undefined;
        };
      },
      launch: () =>
        new Promise((resolve) => {
          pending.push(resolve);
        }),
      refresh: async () => undefined,
      hide: () => hidden?.(),
      quit: () => undefined,
      getVoice: async () => voiceSnapshot,
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

  it("clears LAUNCH FAILED when a tile is clicked and when the window hides", async () => {
    await renderApp();
    const tile = host?.querySelector(".tile");
    expect(tile?.getAttribute("aria-label")).toBe("Microsoft Edge");
    expect(tile?.textContent).toContain("Edge");

    await act(async () => {
      tile?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      pending[0]?.({ ok: false, error: "Unknown tile" });
      await Promise.resolve();
    });
    expect(footer()).toContain("LAUNCH FAILED");
    expect(footer()).toContain("Unknown tile");

    await act(async () => {
      hidden?.();
    });
    expect(footer()).not.toContain("LAUNCH FAILED");

    await act(async () => {
      tile?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      pending[1]?.({ ok: false, error: "spawn ENOENT" });
      await Promise.resolve();
    });
    expect(footer()).toContain("LAUNCH FAILED  spawn ENOENT");

    await act(async () => {
      tile?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(footer()).not.toContain("LAUNCH FAILED");
    await act(async () => {
      pending[2]?.({ ok: true });
      await Promise.resolve();
    });
    expect(footer()).not.toContain("LAUNCH FAILED");
  });
});
