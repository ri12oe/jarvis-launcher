import { describe, expect, it } from "vitest";
import {
  centerLaunchedWindow,
  centeredWindowRect,
  LAUNCH_WINDOW_FOREGROUND_ATTEMPT,
  LAUNCH_WINDOW_POLL_ATTEMPTS,
  parseWindowSnapshot,
  pickLaunchedWindow,
  type ObservedWindow,
  type WindowRect,
  type WindowSnapshot,
} from "../src/shared/launch-window";

const LAUNCHER_HWND = 100;
const LAUNCHER_PID = 10;

function app(partial: Partial<ObservedWindow> & Pick<ObservedWindow, "hwnd">): ObservedWindow {
  const pid = partial.pid ?? 20;
  return {
    pid,
    ancestors: [pid],
    className: "Chrome_WidgetWin_1",
    title: "Notes",
    width: 900,
    height: 700,
    iconic: false,
    ...partial,
  };
}

function sample(foreground: number, windows: ObservedWindow[]): WindowSnapshot {
  return { foreground, windows };
}

describe("centered window rect", () => {
  it("centers 70 percent of a primary work area", () => {
    expect(centeredWindowRect({ x: 0, y: 0, width: 1920, height: 1080 }, 70, 70)).toEqual({
      x: 288,
      y: 162,
      width: 1344,
      height: 756,
    });
  });

  it("keeps the display origin on a monitor to the right", () => {
    const work = { x: 1920, y: 0, width: 1920, height: 1040 };
    expect(centeredWindowRect(work, 70, 70)).toEqual({ x: 2208, y: 156, width: 1344, height: 728 });
  });

  it("keeps a negative origin on a monitor to the left", () => {
    const work = { x: -1920, y: 0, width: 1536, height: 864 };
    const rect = centeredWindowRect(work, 70, 70);
    expect(rect).toEqual({ x: -1689, y: 130, width: 1075, height: 605 });
    expect(rect.x).toBeGreaterThanOrEqual(work.x);
    expect(rect.y).toBeGreaterThanOrEqual(work.y);
    expect(rect.x + rect.width).toBeLessThanOrEqual(work.x + work.width);
    expect(rect.y + rect.height).toBeLessThanOrEqual(work.y + work.height);
  });

  it("centers under a taskbar that sits on top of the work area", () => {
    expect(centeredWindowRect({ x: 0, y: 48, width: 2560, height: 1400 }, 50, 80)).toEqual({
      x: 640,
      y: 188,
      width: 1280,
      height: 1120,
    });
  });

  it("fills the work area at 100 percent", () => {
    const work = { x: 100, y: 200, width: 800, height: 600 };
    expect(centeredWindowRect(work, 100, 100)).toEqual(work);
  });
});

describe("window picking", () => {
  const request = {
    launcherHwnd: LAUNCHER_HWND,
    launcherPid: LAUNCHER_PID,
    allowForegroundFallback: true,
  };

  it("prefers the spawned pid over a different foreground window", () => {
    const launched = app({ hwnd: 30, pid: 50, ancestors: [50, LAUNCHER_PID], title: "Cursor" });
    const other = app({ hwnd: 40, pid: 77, title: "Mail" });
    const picked = pickLaunchedWindow({
      ...request,
      spawnedPid: 50,
      samples: [sample(40, [other, launched])],
    });
    expect(picked?.hwnd).toBe(30);
  });

  it("follows a child process of the spawn", () => {
    const child = app({ hwnd: 31, pid: 80, ancestors: [80, 60, 50], title: "Cursor" });
    const picked = pickLaunchedWindow({
      ...request,
      spawnedPid: 50,
      allowForegroundFallback: false,
      samples: [sample(LAUNCHER_HWND, [child])],
    });
    expect(picked?.hwnd).toBe(31);
  });

  it("picks the foreground window when one pid owns several", () => {
    const back = app({ hwnd: 32, pid: 50, ancestors: [50], title: "Back" });
    const front = app({ hwnd: 33, pid: 51, ancestors: [51, 50], title: "Front" });
    const picked = pickLaunchedWindow({
      ...request,
      spawnedPid: 50,
      samples: [sample(33, [back, front])],
    });
    expect(picked?.hwnd).toBe(33);
  });

  it("uses the new foreground window when there is no spawned pid", () => {
    const explorer = app({
      hwnd: 70,
      pid: 900,
      ancestors: [900, 4],
      className: "CabinetWClass",
      title: "Documents",
    });
    const picked = pickLaunchedWindow({
      ...request,
      samples: [sample(LAUNCHER_HWND, []), sample(70, [explorer])],
    });
    expect(picked).toMatchObject({ hwnd: 70, className: "CabinetWClass" });
  });

  it("waits for a foreground fallback until the caller allows it", () => {
    const explorer = app({ hwnd: 70, pid: 900, className: "CabinetWClass", title: "Documents" });
    const samples = [sample(70, [explorer])];
    expect(
      pickLaunchedWindow({
        ...request,
        spawnedPid: 4242,
        allowForegroundFallback: false,
        samples,
      }),
    ).toBeUndefined();
    expect(
      pickLaunchedWindow({
        ...request,
        spawnedPid: 4242,
        allowForegroundFallback: true,
        samples,
      })?.hwnd,
    ).toBe(70);
  });

  it("does not pick the launcher, a tiny popup, or the desktop shell", () => {
    const launcher = app({ hwnd: LAUNCHER_HWND, pid: LAUNCHER_PID, title: "Jarvis" });
    const otherLauncher = app({ hwnd: 101, pid: LAUNCHER_PID, title: "Jarvis" });
    const tiny = app({ hwnd: 8, pid: 3, width: 100, height: 40, title: "Popup" });
    const shells = ["Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd"].map((className, index) =>
      app({ hwnd: 200 + index, pid: 4, className, title: className, width: 1920, height: 1080 }),
    );
    for (const foreground of [launcher, otherLauncher, tiny, ...shells]) {
      expect(
        pickLaunchedWindow({
          ...request,
          samples: [sample(foreground.hwnd, [foreground])],
        }),
      ).toBeUndefined();
    }
  });

  it("accepts a minimized window and still refuses an empty class", () => {
    const iconic = app({ hwnd: 90, pid: 44, width: 40, height: 30, iconic: true, title: "Edge" });
    expect(pickLaunchedWindow({ ...request, samples: [sample(90, [iconic])] })?.hwnd).toBe(90);
    const blank = app({ hwnd: 91, pid: 45, className: "" });
    expect(pickLaunchedWindow({ ...request, samples: [sample(91, [blank])] })).toBeUndefined();
  });
});

describe("window snapshot parsing", () => {
  it("keeps real windows and drops a bad row", () => {
    const parsed = parseWindowSnapshot(
      JSON.stringify({
        foreground: 50,
        windows: [
          {
            hwnd: 50,
            pid: 9,
            ancestors: [9, 4],
            className: "CabinetWClass",
            title: "Docs",
            width: 800,
            height: 600,
            iconic: false,
          },
          { hwnd: "no" },
        ],
      }),
    );
    expect(parsed).toEqual({
      foreground: 50,
      windows: [
        {
          hwnd: 50,
          pid: 9,
          ancestors: [9, 4],
          className: "CabinetWClass",
          title: "Docs",
          width: 800,
          height: 600,
          iconic: false,
        },
      ],
    });
  });

  it("returns nothing for a payload that is not a snapshot", () => {
    expect(parseWindowSnapshot("")).toBeUndefined();
    expect(parseWindowSnapshot("not json")).toBeUndefined();
    expect(parseWindowSnapshot("null")).toBeUndefined();
    expect(parseWindowSnapshot('{"foreground":1}')).toBeUndefined();
  });
});

describe("centerLaunchedWindow", () => {
  const workArea: WindowRect = { x: 0, y: 0, width: 1920, height: 1080 };
  const centered = { x: 288, y: 162, width: 1344, height: 756 };

  function harness(listWindows: () => Promise<WindowSnapshot | undefined>) {
    const placed: Array<{ hwnd: number; rect: WindowRect }> = [];
    let lists = 0;
    const run = (extra: Partial<Parameters<typeof centerLaunchedWindow>[0]> = {}) =>
      centerLaunchedWindow({
        platform: "win32",
        mode: "centered",
        widthPct: 70,
        heightPct: 70,
        workArea,
        launcherHwnd: LAUNCHER_HWND,
        launcherPid: LAUNCHER_PID,
        listWindows: async () => {
          lists += 1;
          return listWindows();
        },
        placeWindow: async (hwnd, rect) => {
          placed.push({ hwnd, rect });
          return true;
        },
        sleep: async () => undefined,
        ...extra,
      });
    return { placed, run, lists: () => lists };
  }

  it("does nothing off Windows or when mode is default", async () => {
    const idle = harness(async () => sample(1, []));
    expect(await idle.run({ platform: "linux" })).toBe(false);
    expect(await idle.run({ mode: "default" })).toBe(false);
    expect(idle.lists()).toBe(0);
    expect(idle.placed).toEqual([]);
  });

  it("places the foreground window on the first snapshot when there is no pid", async () => {
    const edge = app({ hwnd: 40, pid: 80, title: "Edge" });
    let reads = 0;
    const tools = harness(async () => {
      reads += 1;
      return sample(40, [edge]);
    });
    expect(await tools.run()).toBe(true);
    expect(reads).toBe(1);
    expect(tools.placed).toEqual([{ hwnd: 40, rect: centered }]);
  });

  it("applies the screen-pixel conversion before moving", async () => {
    const edge = app({ hwnd: 40, title: "Edge" });
    const tools = harness(async () => sample(40, [edge]));
    expect(
      await tools.run({
        toScreenRect: (rect) => ({ ...rect, x: rect.x + 1920, y: rect.y + 10 }),
      }),
    ).toBe(true);
    expect(tools.placed[0]?.rect).toEqual({ x: 2208, y: 172, width: 1344, height: 756 });
  });

  it("falls back to the foreground Explorer window after the spawned pid misses", async () => {
    const cabinet = app({ hwnd: 70, pid: 900, className: "CabinetWClass", title: "Documents" });
    let reads = 0;
    const tools = harness(async () => {
      reads += 1;
      if (reads <= LAUNCH_WINDOW_FOREGROUND_ATTEMPT) return sample(LAUNCHER_HWND, []);
      return sample(70, [cabinet]);
    });
    expect(await tools.run({ spawnedPid: 4242 })).toBe(true);
    expect(reads).toBe(LAUNCH_WINDOW_FOREGROUND_ATTEMPT + 1);
    expect(tools.placed).toEqual([{ hwnd: 70, rect: centered }]);
  });

  it("fails quietly when no window appears", async () => {
    const tools = harness(async () => sample(LAUNCHER_HWND, []));
    expect(await tools.run({ spawnedPid: 50 })).toBe(false);
    expect(tools.lists()).toBe(LAUNCH_WINDOW_POLL_ATTEMPTS);
    expect(tools.placed).toEqual([]);
  });

  it("keeps polling after a list error and stops when the move throws", async () => {
    let reads = 0;
    const edge = app({ hwnd: 41, title: "Edge" });
    const listed = harness(async () => {
      reads += 1;
      if (reads < 3) throw new Error("busy");
      return sample(41, [edge]);
    });
    expect(await listed.run()).toBe(true);
    expect(reads).toBe(3);

    const thrown = harness(async () => sample(41, [edge]));
    expect(
      await thrown.run({
        placeWindow: async () => {
          throw new Error("denied");
        },
      }),
    ).toBe(false);
  });
});
