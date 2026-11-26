import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ComputerTask,
  freeName,
  matchStartApp,
  PROJECTS_FOLDER,
  type ComputerHost,
} from "../src/main/computer";
import {
  KEY_COMBOS,
  codeLines,
  mailtoUrl,
  parseComputerCall,
  planLine,
  safeEmailList,
  safeFilename,
  spotifySearchUrl,
} from "../src/shared/computer";
import type { ForegroundWindow } from "../src/main/windows-input";

describe("computer-control checks", () => {
  it("allows plain code file names only", () => {
    expect(safeFilename("hello.py")).toBe("hello.py");
    expect(safeFilename("my app.js")).toBe("my app.js");
    expect(safeFilename("../hello.py")).toBeUndefined();
    expect(safeFilename("C:\\x\\hello.py")).toBeUndefined();
    expect(safeFilename("run.exe")).toBeUndefined();
    expect(safeFilename("hello")).toBeUndefined();
  });

  it("checks email addresses", () => {
    expect(safeEmailList("ta@iu.edu")).toBe("ta@iu.edu");
    expect(safeEmailList("a@iu.edu, b@iu.edu")).toBe("a@iu.edu;b@iu.edu");
    expect(safeEmailList("the TA")).toBeUndefined();
    expect(mailtoUrl("a@iu.edu;b@iu.edu", "Lab 3 question")).toBe(
      "mailto:a%40iu.edu,b%40iu.edu?subject=Lab%203%20question",
    );
  });

  it("refuses keys that send, close, or wipe", () => {
    for (const keys of [
      "ctrl+enter",
      "alt+s",
      "alt+f4",
      "ctrl+w",
      "ctrl+a",
      "shift+delete",
      "delete",
    ]) {
      expect(parseComputerCall("press_keys", { keys })).toBeUndefined();
      expect(KEY_COMBOS[keys]).toBeUndefined();
    }
    expect(parseComputerCall("press_keys", { keys: "Ctrl + S" })).toEqual({
      tool: "press_keys",
      keys: "ctrl+s",
    });
  });

  it("only opens known settings pages and clamps waits", () => {
    expect(parseComputerCall("open_settings", { page: "Bluetooth" })).toEqual({
      tool: "open_settings",
      page: "bluetooth",
    });
    expect(
      parseComputerCall("open_settings", { page: "ms-settings:../../x" }),
    ).toBeUndefined();
    expect(parseComputerCall("wait", { seconds: 60 })).toEqual({
      tool: "wait",
      seconds: 5,
    });
    expect(parseComputerCall("delete_file", { path: "x" })).toBeUndefined();
  });

  it("speaks a plan and builds links", () => {
    expect(
      planLine([{ tool: "write_code", filename: "hello.py", code: "x" }]),
    ).toBe("Opening VS Code and writing hello.py.");
    expect(spotifySearchUrl("Blinding Lights")).toBe(
      "spotify:search:Blinding%20Lights",
    );
    expect(codeLines("def f():\n\treturn 1\n\n")).toEqual([
      "def f():",
      "    return 1",
    ]);
  });

  it("matches Start menu apps and never reuses a file name", () => {
    const apps = [
      {
        name: "Calculator",
        appId: "Microsoft.WindowsCalculator_8wekyb3d8bbwe!App",
      },
      { name: "Notepad", appId: "Microsoft.WindowsNotepad_8wekyb3d8bbwe!App" },
    ];
    expect(matchStartApp("notepad", apps)?.name).toBe("Notepad");
    expect(matchStartApp("photoshop", apps)).toBeUndefined();
    const taken = new Set([
      path.join("D", "hello.py"),
      path.join("D", "hello-2.py"),
    ]);
    expect(freeName("D", "hello.py", (file) => taken.has(file))).toBe(
      "hello-3.py",
    );
  });
});

/** A fake PC: a list of windows, one in front, and a log of what was typed. */
function fakePc(
  options: {
    vscode?: boolean;
    outlook?: boolean;
    stealFocusAfter?: number;
  } = {},
) {
  const typed: string[] = [];
  const pressed: number[][] = [];
  const files = new Map<string, string>();
  const opened: string[] = [];
  let clock = 0;
  let cleared = 0;
  let front: ForegroundWindow = {
    hwnd: 10,
    pid: 999,
    process: "electron",
    title: "Jarvis",
  };
  const host: ComputerHost = {
    available: () => true,
    foreground: async () => front,
    find: async () => 0,
    focus: async () => front,
    typeLine: async (text, expect, enter, _delay, clear) => {
      if (front.hwnd !== expect) return false;
      typed.push(text + (enter ? "\n" : ""));
      if (clear && enter) cleared += 1;
      if (
        options.stealFocusAfter !== undefined &&
        typed.length >= options.stealFocusAfter
      ) {
        front = { hwnd: 77, pid: 5, process: "chrome", title: "Other" };
      }
      return true;
    },
    keys: async (vks, expect) => {
      if (front.hwnd !== expect) return false;
      pressed.push([...vks]);
      return true;
    },
    openExternal: async (url) => {
      opened.push(url);
      if (url.startsWith("mailto:") && options.outlook) {
        front = {
          hwnd: 40,
          pid: 4,
          process: "OUTLOOK",
          title: "Lab 3 - Message (HTML)",
        };
      }
    },
    spawnDetached: (_file, args) => {
      if (options.vscode)
        front = {
          hwnd: 30,
          pid: 3,
          process: "Code",
          title: `${path.basename(args[1] ?? "")} - Jarvis Projects - Visual Studio Code`,
        };
    },
    launchTileByName: async () => undefined,
    startApps: async () => [],
    documentsDir: () => "Docs",
    vsCodePath: () => (options.vscode ? "Code.exe" : undefined),
    regExe: () => "reg.exe",
    runFile: async () => undefined,
    exists: (file) => files.has(file),
    readFile: (file) => files.get(file),
    mkdir: () => undefined,
    writeFile: (file, text) => {
      files.set(file, text);
    },
    ownPid: () => 999,
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
  };
  return { host, typed, pressed, files, opened, cleared: () => cleared };
}

describe("computer tasks", () => {
  const signal = new AbortController().signal;

  it("writes code in VS Code, line by line, then saves", async () => {
    const pc = fakePc({ vscode: true });
    const result = await new ComputerTask(pc.host).run(
      {
        tool: "write_code",
        filename: "hello.py",
        code: 'def main():\n    print("Hello, world!")\n\nmain()\n',
      },
      signal,
    );
    expect(result).toMatch(/^OK: wrote hello\.py \(4 lines\)/);
    expect(pc.typed.join("")).toBe(
      'def main():\n    print("Hello, world!")\n\nmain()',
    );
    expect(pc.pressed).toEqual([KEY_COMBOS["ctrl+s"]]);
    const settings = JSON.parse(
      pc.files.get(
        path.join("Docs", PROJECTS_FOLDER, ".vscode", "settings.json"),
      ) ?? "{}",
    );
    expect(settings["[python]"]["editor.autoIndent"]).toBe("none");
    expect(settings["python.analysis.autoIndent"]).toBe(false);
    // Every Enter is followed by Shift+Home, so VS Code's own indent is replaced.
    expect(pc.cleared()).toBe(3);
  });

  it("updates older Jarvis settings but keeps the user's own keys", async () => {
    const pc = fakePc({ vscode: true });
    const file = path.join("Docs", PROJECTS_FOLDER, ".vscode", "settings.json");
    pc.files.set(
      file,
      JSON.stringify({ "editor.fontSize": 16, "editor.autoIndent": "full" }),
    );
    await new ComputerTask(pc.host).run(
      { tool: "write_code", filename: "a.py", code: "x = 1" },
      signal,
    );
    const settings = JSON.parse(pc.files.get(file) ?? "{}");
    expect(settings["editor.fontSize"]).toBe(16);
    expect(settings["editor.autoIndent"]).toBe("none");
  });

  it("stops typing when another window comes to the front", async () => {
    const pc = fakePc({ vscode: true, stealFocusAfter: 1 });
    const result = await new ComputerTask(pc.host).run(
      { tool: "write_code", filename: "a.py", code: "a = 1\nb = 2\nc = 3" },
      signal,
    );
    expect(result).toMatch(/^Failed: stopped after 1 of 3 lines/);
    expect(pc.pressed).toEqual([]);
  });

  it("does not type when VS Code is missing", async () => {
    const pc = fakePc();
    expect(
      await new ComputerTask(pc.host).run(
        { tool: "write_code", filename: "a.py", code: "x" },
        signal,
      ),
    ).toMatch(/^Failed: VS Code/);
    expect(pc.typed).toEqual([]);
  });

  it("drafts an email in Outlook and never sends it", async () => {
    const pc = fakePc({ outlook: true });
    const result = await new ComputerTask(pc.host).run(
      {
        tool: "draft_email",
        to: "ta@iu.edu",
        subject: "Lab 3",
        body: "Hi,\n\nI have a question.\n\nThanks,\nRio",
      },
      signal,
    );
    expect(result).toMatch(/not sent/);
    expect(pc.opened).toEqual(["mailto:ta%40iu.edu?subject=Lab%203"]);
    expect(pc.typed.join("")).toBe("Hi,\n\nI have a question.\n\nThanks,\nRio");
    expect(pc.pressed).toEqual([]);
  });

  it("does not type a draft when the mail app is not Outlook", async () => {
    const pc = fakePc();
    const result = await new ComputerTask(pc.host).run(
      { tool: "draft_email", to: "ta@iu.edu", subject: "Hi", body: "Hello" },
      signal,
    );
    expect(result).toMatch(/^Failed: the draft opened outside Outlook/);
    expect(pc.typed).toEqual([]);
  });

  it("never types into Jarvis itself", async () => {
    const pc = fakePc();
    expect(
      await new ComputerTask(pc.host).run(
        { tool: "type_text", text: "hello" },
        signal,
      ),
    ).toMatch(/^Failed: there is no app window/);
    expect(pc.typed).toEqual([]);
  });
});
