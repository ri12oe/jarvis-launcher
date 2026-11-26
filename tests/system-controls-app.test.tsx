// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/renderer/App";
import type { SystemAction, SystemState } from "../src/shared/system";
import type { JarvisBridge, LauncherState, VoiceSnapshot } from "../src/shared/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state: LauncherState = {
  hotkey: "CommandOrControl+Alt+J",
  platform: "win32",
  tiles: [{ id: "edge", label: "Microsoft Edge", kind: "app" }],
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

const system: SystemState = {
  volume: 40,
  muted: false,
  micMuted: false,
  brightness: null,
  media: { title: "Song", artist: "Band", app: "Spotify.exe", status: "paused", position: 65, duration: 200, updatedMs: 0 },
};

describe("system controls in the HUD", () => {
  let root: Root | undefined;
  let host: HTMLDivElement | undefined;
  let actions: [SystemAction, number | undefined][] = [];
  let searches: string[] = [];
  let hides = 0;

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    delete (window as { jarvis?: JarvisBridge }).jarvis;
    vi.useRealTimers();
  });

  async function render(): Promise<HTMLDivElement> {
    actions = [];
    searches = [];
    hides = 0;
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
      systemAction: async (action, value) => {
        actions.push([action, value]);
        if (action === "volume-step") return { ok: true, state: { ...system, volume: 45 } };
        if (action === "mic-toggle") return { ok: false, error: "No microphone" };
        return { ok: true, state: system };
      },
      webSearch: async (query) => {
        searches.push(query);
        return { ok: true };
      },
      openConfig: async () => ({ ok: true }),
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

  const key = async (value: string, target: EventTarget = window) => {
    await act(async () => {
      target.dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true }));
    });
  };

  it("asks before shutting down and runs only on the second click", async () => {
    const view = await render();
    const shutdown = view.querySelector('.sys-icon[title="Shut down"]');
    await click(shutdown);
    expect(actions).toEqual([]);
    expect(view.querySelector(".status")?.textContent).toBe("SHUT DOWN?  CLICK AGAIN TO CONFIRM");
    expect(view.querySelector(".sys-col.armed")).not.toBeNull();
    await click(shutdown);
    expect(actions).toEqual([["shutdown", undefined]]);
    expect(view.querySelector(".sys-col.armed")).toBeNull();
  });

  it("locks at once and drops an armed shutdown after five seconds", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const view = await render();
    await click(view.querySelector('.sys-icon[title="Shut down"]'));
    await act(async () => {
      vi.advanceTimersByTime(5100);
    });
    expect(view.querySelector(".sys-col.armed")).toBeNull();
    await click(view.querySelector('.sys-icon[title="Shut down"]'));
    expect(actions).toEqual([]);
    await click(view.querySelector('.sys-icon[title="Lock"]'));
    expect(actions).toEqual([["lock", undefined]]);
  });

  it("drives media, volume, and the mic, and reports a failure", async () => {
    const view = await render();
    expect(view.querySelector(".media-title")?.textContent).toBe("Song — Band");
    expect(view.querySelector(".media-time")?.textContent).toBe("1:05");
    expect(view.querySelector(".volume-value")?.textContent).toBe("40");
    await click(view.querySelector('[aria-label="Play"]'));
    await click(view.querySelector('[aria-label="Next track"]'));
    await click(view.querySelector('[aria-label="Volume up"]'));
    expect(view.querySelector(".volume-value")?.textContent).toBe("45");
    await click(view.querySelector('[aria-label="Mute"]'));
    await click(view.querySelector('[aria-label="Mute microphone"]'));
    expect(actions).toEqual([
      ["media-toggle", undefined],
      ["media-next", undefined],
      ["volume-step", 5],
      ["mute-toggle", undefined],
      ["mic-toggle", undefined],
    ]);
    expect(view.querySelector(".status")?.textContent).toBe("SYSTEM FAILED  No microphone");
  });

  it("searches Google from the box, focuses it with /, and Esc there does not hide the HUD", async () => {
    const view = await render();
    const input = view.querySelector<HTMLInputElement>('input[aria-label="Search Google"]')!;
    expect(input.placeholder).toBe("Google");
    await key("/");
    expect(document.activeElement).toBe(input);
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "electron docs");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await key("Escape", input);
    expect(hides).toBe(0);
    expect(input.value).toBe("");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "electron docs");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      input.form!.requestSubmit();
      await Promise.resolve();
    });
    expect(searches).toEqual(["electron docs"]);
  });

  it("turns a filter with no match into a web search on Enter", async () => {
    await render();
    for (const letter of "zzq") await key(letter);
    await key("Enter");
    expect(searches).toEqual(["zzq"]);
  });
});
