import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { windowsPowershellPath } from "../src/discovery/start-apps";
import {
  createWindowSession,
  powershellArgs,
  windowHelperScript,
  windowSessionCommand,
  type PlacementProcess,
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
    expect(script).toContain("SetThreadDpiAwarenessContext");
    expect(script).toContain("(IntPtr)(-4)");
    expect(script).toContain("GetWindow");
    expect(script).toContain("ShowWindow");
    expect(script).toContain("SetWindowPos");
    expect(script).toContain("SetForegroundWindow");
    expect(script).toContain("Progman");
    expect(script).toContain("Shell_TrayWnd");
    expect(script).not.toMatch(/Stop-Process|Set-ItemProperty|Winlogon|explorer\.exe|reg\.exe/i);
    expect(powershellArgs(script)).toEqual(["-NoProfile", "-NonInteractive", "-Command", script]);
    expect(script.split("Add-Type").length - 1).toBe(1);
  });

  it("stays alive and serves later samples from the same process", () => {
    const command = windowSessionCommand("C:\\Temp\\jarvis-cmd-1.txt", "C:\\Temp\\jarvis-place-1.txt");
    expect(command).toBeDefined();
    expect(command).toContain("while");
    expect(command).toContain("SAMPLE");
    expect(command).toContain("SERVE ");
    expect(command).toContain("QUIT");
    expect(command).toContain("EmitList");
    expect(command).toContain("ReadPlace");
    expect(command).toContain("FileShare");
    expect(command).toContain("SetLength");
    expect(command).toContain("EmitResult");
    expect(command).toContain("'C:\\Temp\\jarvis-place-1.txt'");
    expect(command?.split("Add-Type").length).toBe(2);
    expect(quotesBalanced(command ?? "")).toBe(true);
    expect(windowSessionCommand("C:\\Temp\\bad\npath.txt", "C:\\Temp\\ok.txt")).toBeUndefined();
  });

  it("does not run PowerShell off Windows", async () => {
    let spawned = false;
    const session = createWindowSession({
      platform: "linux",
      spawnImpl: () => {
        spawned = true;
        throw new Error("should not spawn");
      },
    });
    session.start();
    expect(spawned).toBe(false);
    expect(await session.sample(50)).toBeUndefined();
    const watch = session.serve(1000);
    expect(await watch.nextSample()).toBeUndefined();
    expect(await watch.place(1, { x: 0, y: 0, width: 10, height: 10 })).toBe(false);
  });

  it("tells the same process which new window to move", async () => {
    const stdout = new EventEmitter();
    const child = Object.assign(new EventEmitter(), {
      stdout,
      kill() {
        this.emit("close");
      },
    }) as EventEmitter & PlacementProcess;
    let signal = "";
    const commands: string[] = [];
    const session = createWindowSession({
      platform: "win32",
      env: { SystemRoot: "C:\\Windows" },
      commandPath: "C:\\Temp\\jarvis-cmd-test.txt",
      placePath: "C:\\Temp\\jarvis-place-test.txt",
      spawnImpl: (file, args) => {
        expect(file).toBe(windowsPowershellPath("C:\\Windows"));
        expect(args.slice(0, 3)).toEqual(["-NoProfile", "-NonInteractive", "-Command"]);
        expect(args[3]).toContain("SAMPLE");
        expect(args[3]).toContain("SERVE ");
        expect(args[3]?.split("Add-Type").length).toBe(2);
        return child;
      },
      writeFile: (_filePath, text) => {
        commands.push(text);
        if (text.startsWith("PLACE ")) {
          signal = text;
          stdout.emit("data", '{"foreground":40,"windows":[]}\n{"placed":true}\n');
        }
      },
    });
    session.start();
    const samplePending = session.sample(300);
    expect(commands).toContain("SAMPLE");
    stdout.emit(
      "data",
      `${JSON.stringify({
        foreground: 2,
        windows: [
          {
            hwnd: 2,
            pid: 4,
            ancestors: [4],
            className: "Notepad",
            title: "Notepad",
            exe: "C:\\Windows\\notepad.exe",
            aumid: "",
            x: 0,
            y: 0,
            width: 800,
            height: 600,
            dpi: 96,
            iconic: false,
            owned: false,
          },
        ],
      })}\n`,
    );
    const before = await samplePending;
    expect(before?.windows[0]?.hwnd).toBe(2);
    const watch = session.serve(4000);
    expect(commands).toContain("SERVE 4000");
    const pending = watch.nextSample();
    stdout.emit(
      "data",
      `${JSON.stringify({
        foreground: 40,
        windows: [
          {
            hwnd: 40,
            pid: 80,
            ancestors: [80],
            className: "Chrome_WidgetWin_1",
            title: "Edge",
            exe: "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
            aumid: "",
            width: 800,
            height: 600,
            dpi: 96,
            iconic: false,
            owned: false,
          },
        ],
      })}\n`,
    );
    const snap = await pending;
    expect(snap?.windows[0]?.hwnd).toBe(40);
    expect(await watch.place(0, { x: 10, y: 20, width: 800, height: 600 })).toBe(false);
    expect(await watch.place(40, { x: 10, y: 20, width: 0, height: 600 })).toBe(false);
    expect(signal).toBe("");
    expect(await watch.place(40, { x: 10, y: 20, width: 800, height: 600 })).toBe(true);
    expect(signal).toBe("PLACE 40 10 20 800 600");
    watch.close();
  });

  it("does not kill a helper that has already exited", () => {
    let killed = 0;
    const stdout = new EventEmitter();
    const child = Object.assign(new EventEmitter(), {
      stdout,
      pid: 4242,
      kill() {
        killed += 1;
      },
    }) as EventEmitter & PlacementProcess;
    const session = createWindowSession({
      platform: "win32",
      env: { SystemRoot: "C:\\Windows" },
      commandPath: "C:\\Temp\\jarvis-cmd-stop.txt",
      placePath: "C:\\Temp\\jarvis-place-stop.txt",
      spawnImpl: () => child,
      writeFile: () => undefined,
    });
    session.start();
    child.emit("close", 0);
    session.stop();
    expect(killed).toBe(0);
  });

  it("ends the watch when the helper reports that nothing was placed", async () => {
    const stdout = new EventEmitter();
    const child = Object.assign(new EventEmitter(), {
      stdout,
      kill() {
        this.emit("close");
      },
    }) as EventEmitter & PlacementProcess;
    const session = createWindowSession({
      platform: "win32",
      env: { SystemRoot: "C:\\Windows" },
      commandPath: "C:\\Temp\\jarvis-cmd-miss.txt",
      placePath: "C:\\Temp\\jarvis-place-miss.txt",
      spawnImpl: () => child,
      writeFile: () => undefined,
    });
    session.start();
    const watch = session.serve(4000);
    const pending = watch.nextSample();
    stdout.emit("data", '{"placed":false}\n');
    expect(await pending).toBeUndefined();
  });
});
