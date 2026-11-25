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

function snapshotLine(id: number, hwnd: number, exe: string, title: string): string {
  return `${JSON.stringify({
    id,
    foreground: hwnd,
    windows: [
      {
        hwnd,
        pid: hwnd * 2,
        ancestors: [hwnd * 2],
        className: "Chrome_WidgetWin_1",
        title,
        exe,
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
  })}\n`;
}

function fakeHelper(): { child: PlacementProcess; commands: string[]; killed: () => number } {
  const stdout = new EventEmitter();
  const commands: string[] = [];
  let killed = 0;
  let ended = false;
  let serveId: number | undefined;
  const child = Object.assign(new EventEmitter(), {
    stdout,
    pid: 4242,
    stdin: {
      write(chunk: string) {
        commands.push(chunk);
        const line = chunk.trim();
        if (line.startsWith("SAMPLE ")) {
          const id = Number(line.slice(7));
          if (serveId !== undefined) {
            stdout.emit("data", `{"id":${serveId},"placed":false}\n`);
            serveId = undefined;
          }
          stdout.emit("data", snapshotLine(id, 2, "C:\\Windows\\notepad.exe", "Notepad"));
          return;
        }
        if (line.startsWith("SERVE ")) {
          serveId = Number(line.slice(6).split(" ")[0]);
          return;
        }
        if (line.startsWith("PLACE ")) {
          const id = Number(line.slice(6).split(" ")[0]);
          serveId = undefined;
          stdout.emit("data", `{"id":${id},"placed":true}\n`);
        }
      },
      end() {
        if (ended) return;
        ended = true;
        child.emit("close", 0);
      },
    },
    kill() {
      killed += 1;
      if (ended) return;
      ended = true;
      child.emit("close", 1);
    },
  }) as EventEmitter & PlacementProcess;
  return { child, commands, killed: () => killed };
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
    expect(script).toContain("OpenStandardInput");
    expect(script).toContain("WaitForSingleObject");
    expect(script).toContain("Progman");
    expect(script).toContain("Shell_TrayWnd");
    expect(script).not.toMatch(/Stop-Process|Set-ItemProperty|Winlogon|explorer\.exe|reg\.exe|Test-Path|jarvis-cmd/i);
    expect(powershellArgs(script)).toEqual(["-NoProfile", "-NonInteractive", "-Command", script]);
    expect(script.split("Add-Type").length - 1).toBe(1);
  });

  it("reads commands from stdin and exits when the parent is gone", () => {
    const command = windowSessionCommand(4242);
    expect(command).toBeDefined();
    expect(command).toContain("[JarvisWindows]::Run(4242)");
    expect(command).toContain("SAMPLE ");
    expect(command).toContain("SERVE ");
    expect(command).toContain("PLACE ");
    expect(command).toContain("QUIT");
    expect(command).toContain("OpenStandardInput");
    expect(command).not.toContain("Test-Path");
    expect(command).not.toContain("jarvis-cmd");
    expect(command).not.toContain("ReadAllText");
    expect(command).not.toContain("Start-Sleep -Milliseconds 30");
    expect(command?.split("Add-Type").length).toBe(2);
    expect(quotesBalanced(command ?? "")).toBe(true);
    expect(windowSessionCommand(-1)).toBeUndefined();
    expect(windowSessionCommand(1.5)).toBeUndefined();
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
    expect(await session.stop()).toBeNull();
  });

  it("tells the same process which new window to move", async () => {
    const helper = fakeHelper();
    const session = createWindowSession({
      platform: "win32",
      env: { SystemRoot: "C:\\Windows" },
      parentPid: 4242,
      spawnImpl: (file, args) => {
        expect(file).toBe(windowsPowershellPath("C:\\Windows"));
        expect(args.slice(0, 3)).toEqual(["-NoProfile", "-NonInteractive", "-Command"]);
        expect(args[3]).toContain("[JarvisWindows]::Run(4242)");
        expect(args[3]).toContain("OpenStandardInput");
        expect(args[3]?.split("Add-Type").length).toBe(2);
        return helper.child;
      },
    });
    session.start();
    const before = await session.sample(300);
    expect(before?.windows[0]?.hwnd).toBe(2);
    expect(helper.commands.some((line) => line.startsWith("SAMPLE "))).toBe(true);
    const watch = session.serve(4000);
    expect(helper.commands.some((line) => line.startsWith("SERVE "))).toBe(true);
    const pending = watch.nextSample();
    const serveId = Number(helper.commands.find((line) => line.startsWith("SERVE "))?.slice(6).split(" ")[0]);
    helper.child.stdout.emit("data", snapshotLine(serveId, 40, "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe", "Edge"));
    const snap = await pending;
    expect(snap?.windows[0]?.hwnd).toBe(40);
    expect(await watch.place(0, { x: 10, y: 20, width: 800, height: 600 })).toBe(false);
    expect(await watch.place(40, { x: 10, y: 20, width: 0, height: 600 })).toBe(false);
    expect(helper.commands.some((line) => line.startsWith("PLACE "))).toBe(false);
    expect(await watch.place(40, { x: 10, y: 20, width: 800, height: 600 })).toBe(true);
    expect(helper.commands.some((line) => line.startsWith("PLACE ") && line.includes(" 40 10 20 800 600"))).toBe(true);
    watch.close();
    expect(helper.killed()).toBe(0);
  });

  it("keeps a sample that arrives while a placement is in flight", async () => {
    const helper = fakeHelper();
    const session = createWindowSession({
      platform: "win32",
      env: { SystemRoot: "C:\\Windows" },
      parentPid: 7,
      spawnImpl: () => helper.child,
    });
    session.start();
    const watch = session.serve(4000);
    const pending = watch.nextSample();
    const during = session.sample(300);
    expect(await pending).toBeUndefined();
    expect((await during)?.windows[0]?.hwnd).toBe(2);
    expect(helper.commands.filter((line) => line.startsWith("SAMPLE "))).toHaveLength(1);
    expect(helper.commands.filter((line) => line.startsWith("SERVE "))).toHaveLength(1);
  });

  it("does not kill a helper that has already exited", async () => {
    const helper = fakeHelper();
    const session = createWindowSession({
      platform: "win32",
      env: { SystemRoot: "C:\\Windows" },
      parentPid: 7,
      spawnImpl: () => helper.child,
    });
    session.start();
    helper.child.stdin.end();
    expect(await session.stop()).toBe(0);
    expect(helper.killed()).toBe(0);
  });

  it("ends the watch when the helper reports that nothing was placed", async () => {
    const helper = fakeHelper();
    const session = createWindowSession({
      platform: "win32",
      env: { SystemRoot: "C:\\Windows" },
      parentPid: 7,
      spawnImpl: () => helper.child,
    });
    session.start();
    const watch = session.serve(4000);
    const pending = watch.nextSample();
    const serveId = Number(helper.commands.find((line) => line.startsWith("SERVE "))?.slice(6).split(" ")[0]);
    helper.child.stdout.emit("data", `{"id":${serveId},"placed":false}\n`);
    expect(await pending).toBeUndefined();
  });
});
