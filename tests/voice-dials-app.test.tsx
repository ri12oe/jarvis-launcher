// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../src/renderer/App";
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
    { id: "google", label: "Google", kind: "app" },
  ],
  warnings: [],
  scanning: false,
  refreshFailed: false,
  dock: ["downloads", null, null, null],
  plates: [{ slot: 22, tileId: "cursor" }],
  dials: { G: "google", E: null },
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

describe("push to talk, calendar, and dials", () => {
  let root: Root | undefined;
  let host: HTMLDivElement | undefined;
  let actions: SystemAction[] = [];
  let launched: string[] = [];
  let talks = 0;
  let talkResult: { ok: boolean; error?: string } = { ok: true };

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    delete (window as { jarvis?: JarvisBridge }).jarvis;
  });

  async function render(phase: VoiceSnapshot["phase"] = "idle"): Promise<HTMLDivElement> {
    actions = [];
    launched = [];
    talks = 0;
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
      getVoice: async () => ({ ...voice, phase }),
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
      getSettings: async () => null,
      saveSettings: async () => ({ ok: true }),
      findPlace: async () => ({ ok: true, places: [] }),
      talk: async () => {
        talks++;
        return talkResult;
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

  const flush = async (fn: () => void) => {
    await act(async () => {
      fn();
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  it("talks from the emblem and says why when voice cannot listen", async () => {
    talkResult = { ok: true };
    const view = await render();
    const emblem = view.querySelector<HTMLElement>(".emblem-btn")!;
    expect(emblem.getAttribute("aria-label")).toBe("Talk to Jarvis");
    await flush(() => emblem.click());
    expect(talks).toBe(1);
    talkResult = { ok: false, error: "Voice needs an xAI API key" };
    await flush(() => emblem.click());
    expect(view.querySelector(".status")?.textContent).toBe("VOICE NEEDS AN XAI API KEY");
  });

  it("shows the emblem listening and offers to stop", async () => {
    const view = await render("listening");
    const emblem = view.querySelector(".emblem-btn")!;
    expect(emblem.classList.contains("phase-listening")).toBe(true);
    expect(emblem.getAttribute("aria-label")).toBe("Stop listening");
  });

  it("opens the calendar from the clock, the date, and the analog clock", async () => {
    const view = await render();
    for (const button of view.querySelectorAll<HTMLElement>(".clock-btn")) await flush(() => button.click());
    expect(actions).toEqual(["open-calendar", "open-calendar", "open-calendar"]);
  });

  it("opens the G dial tile and explains an empty E dial", async () => {
    const view = await render();
    const g = view.querySelector<HTMLElement>(".dial-btn.g")!;
    expect(g.getAttribute("title")).toBe("G dial: Google");
    await flush(() => g.click());
    expect(launched).toEqual(["google"]);
    await flush(() => view.querySelector<HTMLElement>(".dial-btn.e")!.click());
    expect(launched).toEqual(["google"]);
    expect(view.querySelector(".status")?.textContent).toBe("DIAL E IS EMPTY  SET IT IN SETTINGS");
    const open = [...view.querySelectorAll(".plate-label")].map((node) => node.textContent);
    expect(open).not.toContain("Google");
  });

  it("says to restart when the app code behind the page is older than the page", async () => {
    const view = await render();
    act(() => root?.unmount());
    host?.remove();
    const old = { ...(window as unknown as { jarvis: Record<string, unknown> }).jarvis };
    delete old.talk;
    delete old.getSettings;
    (window as unknown as { jarvis: unknown }).jarvis = old;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(<App />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(view).toBeTruthy();
    expect(host.querySelector(".status")?.textContent).toBe("RESTART JARVIS  CODE IS OUT OF DATE");
    expect(host.querySelector(".status")?.classList.contains("warn")).toBe(true);
  });
});
