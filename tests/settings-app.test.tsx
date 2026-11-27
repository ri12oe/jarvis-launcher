// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../src/renderer/App";
import type { SettingsValues } from "../src/shared/settings";
import type { SystemAction, SystemState } from "../src/shared/system";
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
  deep: "",
};

const system: SystemState = {
  volume: 40,
  muted: false,
  micMuted: false,
  brightness: null,
  media: { title: "Song", artist: "Band", app: "Spotify.exe", status: "paused", position: 65, duration: 200, updatedMs: 0 },
};

const saved: SettingsValues = {
  hotkey: "CommandOrControl+Alt+J",
  openAtLogin: false,
  startHidden: false,
  weather: null,
  dock: ["downloads", null, null, null],
  plates: {},
  dials: { G: "google", E: "explorer" },
};

describe("RAM, BIN, the check box, and Settings", () => {
  let root: Root | undefined;
  let host: HTMLDivElement | undefined;
  let actions: SystemAction[] = [];
  let hides = 0;
  let savedValues: SettingsValues[] = [];

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    delete (window as { jarvis?: JarvisBridge }).jarvis;
  });

  async function render(): Promise<HTMLDivElement> {
    actions = [];
    hides = 0;
    savedValues = [];
    const bridge: JarvisBridge = {
      getState: async () => state,
      onState: () => () => undefined,
      onHidden: () => () => undefined,
      launch: async () => ({ ok: true }),
      refresh: async () => undefined,
      hide: () => {
        hides++;
      },
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
      systemAction: async (action) => {
        actions.push(action);
        return { ok: true };
      },
      webSearch: async () => ({ ok: true }),
      openConfig: async () => ({ ok: true }),
      getSettings: async () => saved,
      saveSettings: async (values) => {
        savedValues.push(values);
        return values.hotkey === "Shift+J" ? { ok: false, error: "Invalid hotkey" } : { ok: true };
      },
      findPlace: async () => ({ ok: true, places: [{ label: "Indianapolis, Indiana, US", latitude: 39.77, longitude: -86.16 }] }),
      talk: async () => ({ ok: true }),
      getRecent: async () => [],
      openRecent: async () => ({ ok: true }),
      locate: async () => ({ ok: true }),
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

  const flush = async (fn: () => void) => {
    await act(async () => {
      fn();
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  it("opens Task Manager and the Recycle Bin, and empties the bin only on a second right-click", async () => {
    const view = await render();
    await flush(() => view.querySelector<HTMLElement>(".ram-btn")!.click());
    await flush(() => view.querySelector<HTMLElement>(".bin-btn")!.click());
    expect(actions).toEqual(["open-taskmgr", "open-recyclebin"]);
    const bin = view.querySelector(".bin-btn")!;
    await flush(() => bin.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
    expect(actions).toHaveLength(2);
    expect(view.querySelector(".status")?.textContent).toBe("EMPTY RECYCLE BIN?  RIGHT-CLICK AGAIN TO CONFIRM");
    expect(view.querySelector(".bin-btn.armed")).not.toBeNull();
    await flush(() => bin.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
    expect(actions).toEqual(["open-taskmgr", "open-recyclebin", "empty-recyclebin"]);
  });

  it("clears the message with the check and hides with the cross", async () => {
    const view = await render();
    await flush(() => view.querySelectorAll<HTMLElement>(".dock-btn")[1].click());
    expect(view.querySelector(".status")?.textContent).toBe("DOCK SLOT 2 IS EMPTY  SET IT IN SETTINGS");
    await flush(() => view.querySelector<HTMLElement>(".ok-btn")!.click());
    expect(view.querySelector(".status")?.textContent).toBe("ID-6TH / AM");
    await flush(() => view.querySelector<HTMLElement>(".close-btn")!.click());
    expect(hides).toBe(1);
  });

  it("opens Settings from the gear and the badge, saves, and closes with Esc without hiding", async () => {
    const view = await render();
    await flush(() => view.querySelectorAll<HTMLElement>(".dock-btn")[4].click());
    expect(view.querySelector(".settings")).not.toBeNull();
    const hotkey = view.querySelector<HTMLInputElement>(".settings .hotkey")!;
    expect(hotkey.value).toBe("CommandOrControl+Alt+J");
    await flush(() => hotkey.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, altKey: true, bubbles: true })));
    expect(hotkey.value).toBe("CommandOrControl+Alt+K");
    const startup = view.querySelector<HTMLInputElement>('.settings input[type="checkbox"]')!;
    await flush(() => startup.click());
    await flush(() => view.querySelector<HTMLFormElement>(".settings-body")!.requestSubmit());
    expect(savedValues).toHaveLength(1);
    expect(savedValues[0]).toMatchObject({ hotkey: "CommandOrControl+Alt+K", openAtLogin: true });
    expect(view.querySelector(".settings")).toBeNull();
    expect(view.querySelector(".status")?.textContent).toBe("SETTINGS SAVED");

    await flush(() => view.querySelector<HTMLElement>(".badge-btn")!.click());
    expect(view.querySelector(".settings")).not.toBeNull();
    await flush(() =>
      view.querySelector(".settings")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
    );
    expect(view.querySelector(".settings")).toBeNull();
    expect(hides).toBe(0);
  });

  it("fills the weather from a city search and refuses 0, 0", async () => {
    const view = await render();
    await flush(() => view.querySelector<HTMLElement>(".badge-btn")!.click());
    const weather = view.querySelectorAll<HTMLInputElement>('.settings input[type="checkbox"]')[2];
    await flush(() => weather.click());
    await flush(() => view.querySelector<HTMLFormElement>(".settings-body")!.requestSubmit());
    expect(savedValues).toHaveLength(0);
    expect(view.querySelector(".settings-error")?.textContent).toContain("Pick a city");
    await flush(() => view.querySelector<HTMLElement>(".settings .small")!.click());
    await flush(() => undefined);
    await flush(() => view.querySelector<HTMLElement>(".settings .places button")!.click());
    await flush(() => view.querySelector<HTMLFormElement>(".settings-body")!.requestSubmit());
    expect(savedValues[0].weather).toEqual({
      latitude: 39.77,
      longitude: -86.16,
      label: "Indianapolis, Indiana, US",
      units: "fahrenheit",
    });
  });
});
