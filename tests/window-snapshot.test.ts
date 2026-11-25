import { describe, expect, it } from "vitest";
import { windowsPowershellPath } from "../src/discovery/start-apps";
import {
  listTopLevelWindows,
  placeTopLevelWindow,
  powershellArgs,
  windowHelperScript,
  windowListCommand,
  windowPlaceCommand,
  type WindowRunOptions,
} from "../src/main/window-snapshot";

function quotesBalanced(command: string): boolean {
  let open = false;
  for (const char of command) {
    if (char === "'") open = !open;
  }
  return !open;
}

describe("window helper command", () => {
  it("is one PowerShell argument and only moves a window", () => {
    const script = windowHelperScript();
    expect(script).not.toContain("\n");
    expect(script.length).toBeLessThan(30_000);
    expect(quotesBalanced(script)).toBe(true);
    expect(script).toContain("ShowWindow");
    expect(script).toContain("SetWindowPos");
    expect(script).toContain("SetForegroundWindow");
    expect(script).toContain("Progman");
    expect(script).toContain("Shell_TrayWnd");
    expect(script).not.toMatch(/Stop-Process|Set-ItemProperty|Winlogon|explorer\.exe|reg\.exe/i);
    expect(powershellArgs(script)).toEqual(["-NoProfile", "-NonInteractive", "-Command", script]);
  });

  it("puts only integers into the place command", () => {
    const place = windowPlaceCommand(50, { x: -1920, y: 40, width: 800, height: 600 });
    expect(place).toMatch(/\[JarvisWindows\]::Place\(50, -1920, 40, 800, 600\)/);
    expect(place).toContain(windowListCommand().slice(0, 40));
    expect(windowPlaceCommand(1.5, { x: 0, y: 0, width: 10, height: 10 })).toBeUndefined();
    expect(windowPlaceCommand(10, { x: 0, y: 0, width: 0, height: 10 })).toBeUndefined();
    expect(windowPlaceCommand(0, { x: 0, y: 0, width: 10, height: 10 })).toBeUndefined();
  });

  it("does not run PowerShell off Windows", async () => {
    let called = false;
    const run = async () => {
      called = true;
      return { stdout: "" };
    };
    expect(await listTopLevelWindows("linux", { SystemRoot: "C:\\Windows" }, run)).toBeUndefined();
    expect(await placeTopLevelWindow("linux", {}, 10, { x: 0, y: 0, width: 10, height: 10 }, run)).toBe(false);
    expect(called).toBe(false);
  });

  it("calls Windows PowerShell by its System32 path", async () => {
    const seen: Array<{ file: string; args: string[]; options: WindowRunOptions }> = [];
    const run = async (file: string, args: string[], options: WindowRunOptions) => {
      seen.push({ file, args, options });
      const place = args[3]?.includes("::Place(");
      return { stdout: place ? '{"ok":true}' : '{"foreground":0,"windows":[]}' };
    };
    const env = { SystemRoot: "D:\\Windows\\" };
    const listed = await listTopLevelWindows("win32", env, run);
    expect(listed).toEqual({ foreground: 0, windows: [] });
    expect(seen[0]?.file).toBe(windowsPowershellPath("D:\\Windows\\"));
    expect(seen[0]?.args.slice(0, 3)).toEqual(["-NoProfile", "-NonInteractive", "-Command"]);
    expect(seen[0]?.args[3]).toContain("[JarvisWindows]::List()");
    expect(seen[0]?.options.shell).toBe(false);
    expect(seen[0]?.options.windowsHide).toBe(true);

    const moved = await placeTopLevelWindow("win32", env, 50, { x: 10, y: 20, width: 30, height: 40 }, run);
    expect(moved).toBe(true);
    expect(seen[1]?.args[3]).toContain("Place(50, 10, 20, 30, 40)");
    expect(seen[1]?.options.shell).toBe(false);
  });

  it("returns a quiet miss when PowerShell fails", async () => {
    const run = async () => {
      throw new Error("missing");
    };
    expect(await listTopLevelWindows("win32", { SystemRoot: "C:\\Windows" }, run)).toBeUndefined();
    expect(
      await placeTopLevelWindow("win32", { SystemRoot: "C:\\Windows" }, 4, { x: 1, y: 2, width: 3, height: 4 }, run),
    ).toBe(false);
  });
});
