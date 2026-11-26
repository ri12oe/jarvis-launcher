// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../src/renderer/App";
import type { SystemState } from "../src/shared/system";
import type { JarvisBridge, LauncherState, VoiceSnapshot } from "../src/shared/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state: LauncherState = {
  hotkey: "CommandOrControl+Alt+J",
  platform: "win32",
  tiles: [
    { id: "edge", label: "Microsoft Edge", kind: "app" },
    { id: "downloads", label: "Downloads", kind: "folder" },
    { id: "cursor", label: "Cursor", kind: "app" },
  ],
  warnings: [],
  scanning: false,
  refreshFailed: false,
  dock: ["downloads", null, null, null],
  plates: [{ slot: 22, tileId: "cursor" }],
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

const system: SystemState = {
  volume: 40,
  muted: false,
  micMuted: false,
  brightness: null,
  media: { title: "Song", artist: "Band", app: "Spotify.exe", status: "paused", position: 65, duration: 200, updatedMs: 0 },
};

describe("dock and labelled plates in the HUD", () => {
  let root: Root | undefined;
  let host: HTMLDivElement | undefined;
  let launched: string[] = [];
  let opened = 0;

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    delete (window as { jarvis?: JarvisBridge }).jarvis;
  });

  async function render(): Promise<HTMLDivElement> {
    launched = [];
    opened = 0;
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
      getStats: async () => null as never,
      getSystem: async () => system,
      systemAction: async () => ({ ok: true }),
      webSearch: async () => ({ ok: true }),
      openConfig: async () => {
        opened++;
        return { ok: true };
      },
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

  const click = async (element: Element | null) => {
    await act(async () => {
      (element as HTMLElement).click();
      await Promise.resolve();
    });
  };

  it("launches a dock slot, explains an empty one, and opens config.json from the gear", async () => {
    const view = await render();
    const buttons = view.querySelectorAll(".dock-btn");
    expect(buttons).toHaveLength(5);
    expect(buttons[0].getAttribute("title")).toBe("Downloads");
    await click(buttons[0]);
    expect(launched).toEqual(["downloads"]);
    await click(buttons[1]);
    expect(launched).toEqual(["downloads"]);
    expect(view.querySelector(".status")?.textContent).toBe("DOCK SLOT 2 IS EMPTY  SET IT IN CONFIG.JSON");
    await click(buttons[4]);
    expect(opened).toBe(1);
  });

  it("opens the tile on a labelled plate and keeps the design text", async () => {
    const view = await render();
    const plate = view.querySelector('.plate-btn[aria-label="Cursor"]');
    expect(plate).not.toBeNull();
    expect(plate?.textContent).toBe("");
    await click(plate);
    expect(launched).toEqual(["cursor"]);
    const open = [...view.querySelectorAll(".plate-label")].map((node) => node.textContent).filter(Boolean);
    expect(open).not.toContain("Cursor");
  });
});
