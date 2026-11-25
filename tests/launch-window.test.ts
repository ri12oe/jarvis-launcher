import { describe, expect, it } from "vitest";
import {
  centerLaunchedWindow,
  centeredWindowRect,
  parseWindowSnapshot,
  pickLaunchedWindow,
  targetFromAction,
  type ObservedWindow,
  type WindowRect,
  type WindowSnapshot,
} from "../src/shared/launch-window";

const LAUNCHER_HWND = 100;
const LAUNCHER_PID = 10;

function app(partial: Partial<ObservedWindow> & Pick<ObservedWindow, "hwnd">): ObservedWindow {
  const pid = partial.pid ?? 20;
  return {
    className: "Chrome_WidgetWin_1",
    title: "Notes",
    exe: "",
    aumid: "",
    x: 0,
    y: 0,
    width: 900,
    height: 700,
    dpi: 96,
    iconic: false,
    owned: false,
    ...partial,
    pid,
    ancestors: partial.ancestors ?? [pid],
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
  const edge = { exeName: "msedge.exe", exePath: "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe" };
  const request = {
    launcherHwnd: LAUNCHER_HWND,
    launcherPid: LAUNCHER_PID,
    baseline: [1],
    target: edge,
  };

  it("moves a window that was not open before the launch", () => {
    const launched = app({
      hwnd: 30,
      pid: 80,
      exe: edge.exePath,
      title: "Edge",
    });
    const picked = pickLaunchedWindow({
      ...request,
      samples: [sample(30, [launched])],
    });
    expect(picked?.hwnd).toBe(30);
  });

  it("leaves an unrelated window that was already open", () => {
    const notepad = app({
      hwnd: 1,
      pid: 40,
      exe: "C:\\Windows\\notepad.exe",
      title: "Notepad",
    });
    expect(
      pickLaunchedWindow({
        ...request,
        baseline: [1],
        samples: [sample(1, [notepad])],
      }),
    ).toBeUndefined();
  });

  it("restores an already-open match only when it is the foreground window", () => {
    const existing = app({
      hwnd: 1,
      pid: 80,
      exe: "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
      title: "Edge",
    });
    const behind = sample(LAUNCHER_HWND, [existing]);
    expect(
      pickLaunchedWindow({
        ...request,
        baseline: [1],
        samples: [behind],
      }),
    ).toBeUndefined();
    expect(
      pickLaunchedWindow({
        ...request,
        baseline: [1],
        samples: Array.from({ length: 6 }, () => behind),
      }),
    ).toBeUndefined();
    expect(
      pickLaunchedWindow({
        ...request,
        baseline: [1],
        samples: [sample(1, [existing])],
      })?.hwnd,
    ).toBe(1);
  });

  it("places a new Edge window that appears at look 6, not the old one", () => {
    const existing = app({
      hwnd: 1,
      exe: "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      title: "Edge",
    });
    const opened = app({
      hwnd: 60,
      exe: "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      title: "Edge",
    });
    const quiet = sample(LAUNCHER_HWND, [existing]);
    const samples = [...Array.from({ length: 5 }, () => quiet), sample(LAUNCHER_HWND, [existing, opened])];
    expect(
      pickLaunchedWindow({
        ...request,
        baseline: [1],
        samples,
      })?.hwnd,
    ).toBe(60);
  });

  it("restores an already-open Store app when the AUMID matches", () => {
    const copilot = app({
      hwnd: 7,
      pid: 90,
      aumid: "Microsoft.Copilot_8wekyb3d8bbwe!App",
      title: "Copilot",
    });
    expect(
      pickLaunchedWindow({
        ...request,
        target: { aumid: "Microsoft.Copilot_8wekyb3d8bbwe!App" },
        baseline: [7],
        samples: [sample(7, [copilot])],
      })?.hwnd,
    ).toBe(7);
  });

  it("follows a child of the spawned pid", () => {
    const child = app({ hwnd: 31, pid: 80, ancestors: [80, 60, 50], title: "Cursor" });
    expect(
      pickLaunchedWindow({
        ...request,
        spawnedPid: 50,
        baseline: [],
        samples: [sample(LAUNCHER_HWND, [child])],
      })?.hwnd,
    ).toBe(31);
  });

  it("does not guess when several pid windows qualify and none is foreground", () => {
    const splash = app({ hwnd: 32, pid: 50, ancestors: [50], title: "Splash" });
    const main = app({ hwnd: 33, pid: 51, ancestors: [51, 50], title: "App" });
    expect(
      pickLaunchedWindow({
        ...request,
        spawnedPid: 50,
        baseline: [],
        samples: [sample(LAUNCHER_HWND, [splash, main])],
      }),
    ).toBeUndefined();
    expect(
      pickLaunchedWindow({
        ...request,
        spawnedPid: 50,
        baseline: [],
        samples: [sample(33, [splash, main])],
      })?.hwnd,
    ).toBe(33);
  });

  it("uses the only new Explorer window for a folder", () => {
    const oldExplorer = app({
      hwnd: 4,
      pid: 900,
      className: "CabinetWClass",
      exe: "C:\\Windows\\explorer.exe",
      title: "Documents",
    });
    const opened = app({
      hwnd: 70,
      pid: 900,
      className: "CabinetWClass",
      exe: "C:\\Windows\\explorer.exe",
      title: "Downloads",
    });
    expect(
      pickLaunchedWindow({
        launcherHwnd: LAUNCHER_HWND,
        launcherPid: LAUNCHER_PID,
        baseline: [4],
        target: {},
        samples: [sample(4, [oldExplorer, opened])],
      })?.hwnd,
    ).toBe(70);
  });

  it("does not move an old Explorer window, even when it is in front", () => {
    const explorer = app({
      hwnd: 4,
      pid: 900,
      className: "CabinetWClass",
      exe: "C:\\Windows\\explorer.exe",
      title: "File Explorer",
    });
    const target = { exePath: "C:\\Windows\\explorer.exe", exeName: "explorer.exe" };
    const quiet = sample(4, [explorer]);
    expect(
      pickLaunchedWindow({
        ...request,
        target,
        baseline: [4],
        samples: Array.from({ length: 6 }, () => quiet),
      }),
    ).toBeUndefined();
    const opened = app({
      hwnd: 71,
      pid: 901,
      className: "CabinetWClass",
      exe: "C:\\Windows\\explorer.exe",
      title: "File Explorer",
    });
    expect(
      pickLaunchedWindow({
        ...request,
        target,
        baseline: [4],
        samples: [sample(71, [explorer, opened])],
      })?.hwnd,
    ).toBe(71);
  });

  it("rejects a new window from an unrelated exe", () => {
    const updater = app({
      hwnd: 9,
      pid: 60,
      ancestors: [60, 50],
      exe: "C:\\Program Files\\Vendor\\updater.exe",
      title: "Update",
    });
    expect(
      pickLaunchedWindow({
        ...request,
        spawnedPid: 50,
        baseline: [],
        samples: [sample(9, [updater])],
      }),
    ).toBeUndefined();
    const host = app({
      hwnd: 12,
      exe: "C:\\Windows\\System32\\ApplicationFrameHost.exe",
      className: "ApplicationFrameWindow",
      title: "Copilot",
    });
    expect(
      pickLaunchedWindow({
        launcherHwnd: LAUNCHER_HWND,
        launcherPid: LAUNCHER_PID,
        baseline: [],
        target: { aumid: "Microsoft.Copilot_8wekyb3d8bbwe!App", stub: true },
        samples: [sample(12, [host])],
      })?.hwnd,
    ).toBe(12);
  });

  it("does not treat every window as new when the before-snapshot failed", () => {
    const notepad = app({ hwnd: 5, pid: 40, exe: "C:\\Windows\\notepad.exe", title: "Notepad" });
    expect(
      pickLaunchedWindow({
        ...request,
        baseline: undefined,
        samples: [sample(5, [notepad])],
      }),
    ).toBeUndefined();
  });

  it("skips owned popups, shell windows, and windows that are small in DIP", () => {
    const owned = app({ hwnd: 8, owned: true, title: "Dialog" });
    const tinyDpi = app({ hwnd: 9, width: 200, height: 150, dpi: 192, title: "Popup" });
    const shells = ["Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd"].map((className, index) =>
      app({ hwnd: 200 + index, pid: 4, className, title: className, width: 1920, height: 1080 }),
    );
    for (const foreground of [owned, tinyDpi, ...shells]) {
      expect(
        pickLaunchedWindow({
          ...request,
          baseline: [],
          samples: [sample(foreground.hwnd, [foreground])],
        }),
      ).toBeUndefined();
    }
    const largeEnough = app({
      hwnd: 11,
      width: 400,
      height: 300,
      dpi: 192,
      exe: edge.exePath,
      title: "Edge",
    });
    expect(
      pickLaunchedWindow({
        ...request,
        baseline: [],
        samples: [sample(11, [largeEnough])],
      })?.hwnd,
    ).toBe(11);
  });
});

describe("launch target", () => {
  it("reads an exe, an Edge protocol, a Store id, and a shortcut target", () => {
    expect(targetFromAction({ type: "openPath", path: "C:\\Program Files\\Edge\\msedge.exe" })).toEqual({
      exePath: "C:\\Program Files\\Edge\\msedge.exe",
      exeName: "msedge.exe",
    });
    expect(targetFromAction({ type: "openPath", path: "C:\\Users\\Mario\\Desktop" })).toEqual({});
    expect(targetFromAction({ type: "openExternal", url: "microsoft-edge:" })).toEqual({ exeName: "msedge.exe" });
    expect(
      targetFromAction({
        type: "spawn",
        command: "C:\\Windows\\explorer.exe",
        args: ["shell:AppsFolder\\Microsoft.Copilot_8wekyb3d8bbwe!App"],
      }),
    ).toEqual({ aumid: "Microsoft.Copilot_8wekyb3d8bbwe!App", stub: true });
    expect(
      targetFromAction({ type: "spawn", command: "C:\\Windows\\explorer.exe", args: [] }),
    ).toEqual({ exePath: "C:\\Windows\\explorer.exe", exeName: "explorer.exe" });
    expect(
      targetFromAction({ type: "openPath", path: "C:\\Start\\Cursor.lnk" }, (filePath) =>
        filePath.endsWith(".lnk") ? "C:\\Program Files\\Cursor\\Cursor.exe" : undefined,
      ),
    ).toEqual({ exePath: "C:\\Program Files\\Cursor\\Cursor.exe", exeName: "Cursor.exe" });
    expect(targetFromAction({ type: "openPath", path: "C:\\Apps\\Update.exe" }).stub).toBe(true);
    const claude = targetFromAction({ type: "openPath", path: "C:\\Start\\Claude.lnk" }, () => {
      return "C:\\Program Files\\Claude\\claude.exe";
    });
    expect(claude).toEqual({ exePath: "C:\\Program Files\\Claude\\claude.exe", exeName: "claude.exe" });
    const updater = app({ hwnd: 9, exe: "C:\\Program Files\\Claude\\updater.exe", title: "Update" });
    expect(
      pickLaunchedWindow({
        launcherHwnd: LAUNCHER_HWND,
        launcherPid: LAUNCHER_PID,
        baseline: [],
        target: claude,
        samples: [sample(9, [updater])],
      }),
    ).toBeUndefined();
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
            exe: "C:\\Windows\\explorer.exe",
            aumid: "",
            width: 800,
            height: 600,
            dpi: 120,
            iconic: false,
            owned: false,
          },
          { hwnd: "no" },
        ],
      }),
    );
    expect(parsed?.windows).toEqual([
      {
        hwnd: 50,
        pid: 9,
        ancestors: [9, 4],
        className: "CabinetWClass",
        title: "Docs",
        exe: "C:\\Windows\\explorer.exe",
        aumid: "",
        x: 0,
        y: 0,
        width: 800,
        height: 600,
        dpi: 120,
        iconic: false,
        owned: false,
      },
    ]);
    expect(parsed?.foreground).toBe(50);
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

  function run(snaps: WindowSnapshot[], extra: Partial<Parameters<typeof centerLaunchedWindow>[0]> = {}) {
    const placed: Array<{ hwnd: number; rect: WindowRect }> = [];
    let reads = 0;
    const queue = [...snaps];
    const promise = centerLaunchedWindow({
      platform: "win32",
      mode: "centered",
      widthPct: 70,
      heightPct: 70,
      workArea,
      launcherHwnd: LAUNCHER_HWND,
      launcherPid: LAUNCHER_PID,
      baseline: [],
      target: { exeName: "msedge.exe" },
      nextSample: async () => {
        reads += 1;
        return queue.shift();
      },
      placeWindow: async (hwnd, rect) => {
        placed.push({ hwnd, rect });
        return true;
      },
      ...extra,
    });
    return { placed, reads: () => reads, promise };
  }

  it("does nothing off Windows or when mode is default", async () => {
    const idle = run([], { platform: "linux" });
    expect(await idle.promise).toBe(false);
    const untouched = run([], { mode: "default" });
    expect(await untouched.promise).toBe(false);
    expect(idle.reads()).toBe(0);
    expect(untouched.reads()).toBe(0);
    expect(idle.placed).toEqual([]);
  });

  it("places a new window and converts the rect to screen pixels", async () => {
    const edge = app({ hwnd: 40, exe: "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe", title: "Edge" });
    const tools = run([sample(40, [edge])], {
      toScreenRect: (rect) => ({ ...rect, x: rect.x + 1920, y: rect.y + 10 }),
    });
    expect(await tools.promise).toBe(true);
    expect(tools.reads()).toBe(1);
    expect(tools.placed).toEqual([{ hwnd: 40, rect: { x: 2208, y: 172, width: 1344, height: 756 } }]);
  });

  it("keeps looking until the samples end when nothing qualifies", async () => {
    const notepad = app({ hwnd: 2, exe: "C:\\Windows\\notepad.exe", title: "Notepad" });
    const tools = run([sample(2, [notepad])], { baseline: [2], target: { exeName: "msedge.exe" } });
    expect(await tools.promise).toBe(false);
    expect(tools.placed).toEqual([]);
    expect(tools.reads()).toBe(2);
  });

  it("places a window that was not in the before list taken at the click", async () => {
    const oldNotepad = app({ hwnd: 2, exe: "C:\\Windows\\notepad.exe", title: "Notepad" });
    const edge = app({ hwnd: 40, exe: "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe", title: "Edge" });
    const tools = run([sample(2, [oldNotepad]), sample(40, [oldNotepad, edge])], {
      baseline: [2],
    });
    expect(await tools.promise).toBe(true);
    expect(tools.placed).toEqual([{ hwnd: 40, rect: centered }]);
  });

  it("returns false when the move throws", async () => {
    const edge = app({
      hwnd: 41,
      exe: "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      title: "Edge",
    });
    const tools = run([sample(41, [edge])], {
      placeWindow: async () => {
        throw new Error("denied");
      },
    });
    expect(await tools.promise).toBe(false);
  });
});
