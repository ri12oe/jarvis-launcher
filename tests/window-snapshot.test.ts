import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { windowsPowershellPath } from "../src/discovery/start-apps";
import {
  listTopLevelWindows,
  powershellArgs,
  startWindowWatch,
  windowHelperScript,
  windowListCommand,
  windowServeCommand,
  type PlacementProcess,
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

  it("polls inside one helper process", () => {
    const command = windowServeCommand(4000, "C:\\Temp\\jarvis-place-1.txt");
    expect(command).toBeDefined();
    expect(command).toContain("while");
    expect(command).toContain("Start-Sleep -Milliseconds 200");
    expect(command).toContain("EmitList");
    expect(command).toContain("ReadPlace");
    expect(command).toContain("EmitResult");
    expect(command).toContain("AddMilliseconds(4000)");
    expect(command).toContain("'C:\\Temp\\jarvis-place-1.txt'");
    expect(command?.split("Add-Type").length).toBe(2);
    expect(quotesBalanced(command ?? "")).toBe(true);
    expect(windowServeCommand(0, "C:\\Temp\\x.txt")).toBeUndefined();
    expect(windowServeCommand(1000, "C:\\Temp\\bad\npath.txt")).toBeUndefined();
  });

  it("keeps the one-shot list command on the helper", () => {
    expect(windowListCommand()).toContain("[JarvisWindows]::List()");
    expect(windowListCommand().split("Add-Type").length).toBe(2);
  });

  it("does not run PowerShell off Windows", async () => {
    let called = false;
    const run = async () => {
      called = true;
      return { stdout: "" };
    };
    expect(await listTopLevelWindows("linux", { SystemRoot: "C:\\Windows" }, run)).toBeUndefined();
    expect(called).toBe(false);
    const watch = startWindowWatch({ platform: "linux", timeoutMs: 1000 });
    expect(await watch.nextSample()).toBeUndefined();
    expect(await watch.place(1, { x: 0, y: 0, width: 10, height: 10 })).toBe(false);
  });

  it("calls Windows PowerShell by its System32 path", async () => {
    const seen: Array<{ file: string; args: string[]; options: WindowRunOptions }> = [];
    const run = async (file: string, args: string[], options: WindowRunOptions) => {
      seen.push({ file, args, options });
      return { stdout: '{"foreground":0,"windows":[]}' };
    };
    const env = { SystemRoot: "D:\\Windows\\" };
    const listed = await listTopLevelWindows("win32", env, run);
    expect(listed).toEqual({ foreground: 0, windows: [] });
    expect(seen[0]?.file).toBe(windowsPowershellPath("D:\\Windows\\"));
    expect(seen[0]?.args.slice(0, 3)).toEqual(["-NoProfile", "-NonInteractive", "-Command"]);
    expect(seen[0]?.args[3]).toContain("[JarvisWindows]::List()");
    expect(seen[0]?.options.shell).toBe(false);
    expect(seen[0]?.options.windowsHide).toBe(true);
  });

  it("returns a quiet miss when PowerShell fails", async () => {
    const run = async () => {
      throw new Error("missing");
    };
    expect(await listTopLevelWindows("win32", { SystemRoot: "C:\\Windows" }, run)).toBeUndefined();
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
    const watch = startWindowWatch({
      platform: "win32",
      env: { SystemRoot: "C:\\Windows" },
      timeoutMs: 4000,
      signalPath: "C:\\Temp\\jarvis-place-test.txt",
      spawnImpl: (file, args) => {
        expect(file).toBe(windowsPowershellPath("C:\\Windows"));
        expect(args[3]).toContain("EmitList");
        expect(args[3]).toContain("ReadPlace");
        return child;
      },
      writeSignal: (_filePath, text) => {
        signal = text;
        stdout.emit("data", '{"foreground":40,"windows":[]}\n{"placed":true}\n');
      },
    });
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
});
