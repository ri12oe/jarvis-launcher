import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoverInstalledApps } from "../src/discovery";
import { START_APPS_FAILURE } from "../src/discovery/start-apps";
import { exeFromDisplayIcon, parseUninstallListing, UNINSTALL_KEYS } from "../src/discovery/registry";
import { readInstalledPrograms } from "../src/discovery/registry";
import { scanShortcuts, windowsStartMenuRoots } from "../src/discovery/shortcuts";

const temps: string[] = [];

function makeTemp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-"));
  temps.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const REGISTRY = `
HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Cursor
    DisplayName    REG_SZ    Cursor
    DisplayIcon    REG_SZ    C:\\Users\\Mario\\AppData\\Local\\Programs\\cursor\\Cursor.exe,0
    UninstallString    REG_SZ    "C:\\Users\\Mario\\AppData\\Local\\Programs\\cursor\\unins000.exe"

HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Ollama
    DisplayName    REG_SZ    Ollama
    UninstallString    REG_SZ    C:\\Program Files\\Ollama\\unins000.exe

HKEY_CURRENT_USER\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Perplexity
    DisplayName    REG_SZ    Perplexity
    DisplayIcon    REG_SZ    "C:\\Users\\Mario\\AppData\\Local\\Perplexity\\Perplexity.exe",0

HKEY_CURRENT_USER\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Photos
    DisplayName    REG_SZ    Photos
    DisplayIcon    REG_SZ    C:\\Windows\\System32\\photo.ico,0
`;

describe("shortcut scan", () => {
  it("reads .lnk names from both start-menu roots and skips symlinks", async () => {
    const root = makeTemp();
    const programData = path.join(root, "ProgramData");
    const appData = path.join(root, "AppData");
    const common = path.join(programData, "Microsoft", "Windows", "Start Menu", "Programs");
    const user = path.join(appData, "Microsoft", "Windows", "Start Menu", "Programs");
    fs.mkdirSync(path.join(common, "Apps"), { recursive: true });
    fs.mkdirSync(user, { recursive: true });
    fs.writeFileSync(path.join(common, "ChatGPT.lnk"), "");
    fs.writeFileSync(path.join(common, "Apps", "LM Studio.lnk"), "");
    fs.writeFileSync(path.join(common, "readme.txt"), "not a shortcut");
    fs.writeFileSync(path.join(user, "Claude.lnk"), "");
    const linked = path.join(root, "elsewhere");
    fs.mkdirSync(linked, { recursive: true });
    fs.writeFileSync(path.join(linked, "Grok.lnk"), "");
    fs.symlinkSync(linked, path.join(user, "linked"), "dir");

    const shortcuts = await scanShortcuts([common, user], { maxDepth: 8 });
    expect(shortcuts.map((item) => item.name).sort()).toEqual(["ChatGPT", "Claude", "LM Studio"]);
  });

  it("builds the two Windows start-menu directories", () => {
    expect(
      windowsStartMenuRoots({
        ProgramData: "C:\\ProgramData",
        APPDATA: "C:\\Users\\Mario\\AppData\\Roaming",
      }),
    ).toEqual([
      "C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs",
      "C:\\Users\\Mario\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs",
    ]);
  });
});

describe("uninstall registry parsing", () => {
  it("only queries the uninstall keys", () => {
    expect(UNINSTALL_KEYS).toHaveLength(3);
    for (const key of UNINSTALL_KEYS) {
      expect(key.endsWith("\\Uninstall")).toBe(true);
      expect(key.toLowerCase()).not.toContain("winlogon");
      expect(key.toLowerCase()).not.toContain("explorer");
    }
  });

  it("keeps display names and exe icons, never uninstall strings", () => {
    expect(exeFromDisplayIcon('"C:\\App\\Cursor.exe",0')).toBe("C:\\App\\Cursor.exe");
    expect(exeFromDisplayIcon("C:\\App\\icon.ico,0")).toBeUndefined();
    const programs = parseUninstallListing(REGISTRY);
    expect(programs).toEqual([
      {
        name: "Cursor",
        exePath: "C:\\Users\\Mario\\AppData\\Local\\Programs\\cursor\\Cursor.exe",
      },
      { name: "Ollama", exePath: undefined },
      {
        name: "Perplexity",
        exePath: "C:\\Users\\Mario\\AppData\\Local\\Perplexity\\Perplexity.exe",
      },
      { name: "Photos", exePath: undefined },
    ]);
  });

  it("does not run reg off Windows", async () => {
    await expect(readInstalledPrograms("linux")).resolves.toEqual([]);
  });
});

describe("discoverInstalledApps", () => {
  it("combines start-menu shortcuts and registry records on Windows paths", async () => {
    const root = makeTemp();
    const programs = path.join(root, "ProgramData", "Microsoft", "Windows", "Start Menu", "Programs");
    fs.mkdirSync(programs, { recursive: true });
    fs.writeFileSync(path.join(programs, "Cursor.lnk"), "");
    fs.writeFileSync(path.join(programs, "Notepad.lnk"), "");

    const found = await discoverInstalledApps({
      platform: "win32",
      shortcutRoots: [programs],
      programs: [
        { name: "Cursor", exePath: "C:\\cursor\\Cursor.exe" },
        { name: "Claude", exePath: "C:\\claude\\Claude.exe" },
      ],
      storeApps: [],
    });

    expect(found.warnings).toEqual([]);
    expect(found.apps.map((app) => [app.id, app.source])).toEqual([
      ["claude", "uninstall"],
      ["cursor", "shortcut"],
    ]);
  });

  it("does not scan Windows start-menu paths on Linux", async () => {
    const root = makeTemp();
    const programs = path.join(root, "ProgramData", "Microsoft", "Windows", "Start Menu", "Programs");
    fs.mkdirSync(programs, { recursive: true });
    fs.writeFileSync(path.join(programs, "ChatGPT.lnk"), "");
    const found = await discoverInstalledApps({
      platform: "linux",
      env: { ProgramData: path.join(root, "ProgramData") },
      programs: [],
    });
    expect(found).toEqual({ apps: [], warnings: [] });
  });

  it("matches injected Store apps without calling PowerShell", async () => {
    const found = await discoverInstalledApps({
      platform: "win32",
      shortcutRoots: [],
      programs: [],
      storeApps: [
        { name: "ChatGPT", appId: "OpenAI.ChatGPT-Desktop_2p2nqsdnc2c4m!App" },
        { name: "Calculator", appId: "Microsoft.WindowsCalculator_8wekyb3d8bbwe!App" },
      ],
    });
    expect(found).toEqual({
      warnings: [],
      apps: [
        {
          id: "chatgpt",
          label: "ChatGPT",
          source: "store",
          launchKind: "store",
          launchPath: "OpenAI.ChatGPT-Desktop_2p2nqsdnc2c4m!App",
        },
      ],
    });
  });

  it("keeps shortcut matches and reports a Start menu failure", async () => {
    const root = makeTemp();
    const programs = path.join(root, "Programs");
    fs.mkdirSync(programs, { recursive: true });
    fs.writeFileSync(path.join(programs, "Cursor.lnk"), "");
    const found = await discoverInstalledApps({
      platform: "win32",
      shortcutRoots: [programs],
      programs: [],
      readStoreApps: async () => ({ apps: [], warning: START_APPS_FAILURE }),
    });
    expect(found.warnings).toEqual([START_APPS_FAILURE]);
    expect(found.apps.map((app) => app.id)).toEqual(["cursor"]);
  });
});
