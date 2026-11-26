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
  scanning: false,
  refreshFailed: false,
  dock: ["downloads", null, null, null],
  plates: [{ slot: 22, tileId: "cursor" }],
  dials: { G: "google", E: null },
  leftList: "recent",
  warnings: ["dock slot 3: no tile with id \"steam\""],
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

describe("recent files, confirmations, and the message log", () => {
  let root: Root | undefined;
  let host: HTMLDivElement | undefined;
  let opened: string[] = [];

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    delete (window as { jarvis?: JarvisBridge }).jarvis;
  });

  async function render(): Promise<HTMLDivElement> {
    opened = [];
    const bridge: JarvisBridge = {
      getState: async () => state,
      onState: () => () => undefined,
      onHidden: () => () => undefined,
      launch: async () => ({ ok: true }),
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
      systemAction: async (action) => ({
        ok: true,
        state: action === "mute-toggle" ? { ...system, muted: true } : system,
        detail: action === "open-calendar" ? "Calendar: opened ms-actioncenter: on Windows 10.0.22631" : undefined,
      }),
      webSearch: async () => ({ ok: true }),
      openConfig: async () => ({ ok: true }),
      getSettings: async () => null,
      saveSettings: async () => ({ ok: true }),
      findPlace: async () => ({ ok: true, places: [] }),
      talk: async () => ({ ok: true }),
      getRecent: async () => [
        { id: "0", name: "Resume.pdf" },
        { id: "1", name: "notes.txt" },
      ],
      openRecent: async (id) => {
        opened.push(id);
        return { ok: true };
      },
      locate: async () => ({ ok: false, error: "Location lookup failed" }),
    };
    (window as { jarvis?: JarvisBridge }).jarvis = bridge;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(<App />);
      await Promise.resolve();
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

  it("lists recent files around the cyan line and opens one", async () => {
    const view = await render();
    expect(view.querySelector(".left-list .liriks")?.textContent).toBe("RECENT FILES");
    const rows = [...view.querySelectorAll<HTMLElement>(".recent-row")];
    expect(rows.map((row) => row.textContent)).toEqual(["RESUME.PDF", "NOTES.TXT"]);
    await flush(() => rows[1].click());
    expect(opened).toEqual(["1"]);
  });

  it("confirms a control, shows config warnings when idle, and keeps a log", async () => {
    const view = await render();
    expect(view.querySelector(".status")?.textContent).toBe("1 CONFIG WARNING");
    expect(view.querySelector(".status")?.classList.contains("warn")).toBe(true);
    await flush(() => view.querySelector<HTMLElement>('[aria-label="Mute"]')!.click());
    expect(view.querySelector(".status")?.textContent).toBe("MUTED");
    expect(view.querySelector(".status")?.classList.contains("warn")).toBe(false);
    await flush(() => view.querySelector<HTMLElement>(".status-btn")!.click());
    const log = view.querySelector(".message-log")!;
    expect(log.textContent).toContain('dock slot 3: no tile with id "steam"');
    expect(log.textContent).toContain("MUTED");
    await flush(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(view.querySelector(".message-log")).toBeNull();
  });

  it("logs what the clock did, so a calendar problem can be traced", async () => {
    const view = await render();
    await flush(() => view.querySelector<HTMLElement>(".clock-btn.desk")!.click());
    await flush(() => view.querySelector<HTMLElement>(".status-btn")!.click());
    expect(view.querySelector(".message-log")?.textContent).toContain(
      "CALENDAR: OPENED MS-ACTIONCENTER: ON WINDOWS 10.0.22631",
    );
  });
});
