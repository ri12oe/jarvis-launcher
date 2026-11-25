import { describe, expect, it } from "vitest";
import { matchAiApps } from "../src/shared/match";
import type { InstalledProgram, ShortcutRecord } from "../src/shared/types";

const shortcut = (name: string, target?: string): ShortcutRecord => ({
  name,
  lnkPath: `C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\${name}.lnk`,
  target,
});

describe("matchAiApps", () => {
  it("matches the known AI app names and ignores everything else", () => {
    const shortcuts: ShortcutRecord[] = [
      shortcut("ChatGPT"),
      shortcut("Claude"),
      shortcut("Cursor"),
      shortcut("Grok"),
      shortcut("Microsoft Copilot"),
      shortcut("Perplexity"),
      shortcut("Ollama"),
      shortcut("LM Studio"),
      shortcut("Notepad"),
      shortcut("Visual Studio Code"),
      shortcut("Calculator"),
      shortcut("Chat"),
      shortcut("Elm Studio"),
    ];

    const found = matchAiApps({ shortcuts, programs: [] });
    expect(found.map((app) => app.id)).toEqual([
      "chatgpt",
      "claude",
      "cursor",
      "grok",
      "copilot",
      "perplexity",
      "ollama",
      "lm-studio",
      "vscode",
    ]);
    expect(found.every((app) => app.source === "shortcut" && app.launchKind === "shortcut")).toBe(true);
  });

  it("finds the MARIO OS slot apps by shortcut name or target", () => {
    const found = matchAiApps({
      shortcuts: [
        shortcut("Gemini"),
        shortcut("Word"),
        shortcut("Spotify", "C:\\Users\\Mario\\AppData\\Roaming\\Spotify\\Spotify.exe"),
        shortcut("Outlook (new)"),
        shortcut("GitHub Desktop", "C:\\Users\\Mario\\AppData\\Local\\GitHubDesktop\\GitHubDesktop.exe"),
        shortcut("VS", "C:\\Users\\Mario\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe"),
        shortcut("WordPad"),
        shortcut("Spotify Web Helper Uninstall"),
        shortcut("GitHub CLI"),
      ],
      programs: [],
    });
    expect(found.map((app) => app.id)).toEqual(["gemini", "vscode", "word", "spotify", "outlook", "github"]);
  });

  it("accepts spacing and hyphen variants", () => {
    const found = matchAiApps({
      shortcuts: [shortcut("Chat GPT"), shortcut("LM-Studio"), shortcut("LMStudio")],
      programs: [],
    });
    expect(found.map((app) => app.id)).toEqual(["chatgpt", "lm-studio"]);
    expect(found.find((app) => app.id === "lm-studio")?.launchPath).toContain("LMStudio.lnk");
  });

  it("matches a shortcut target when the link name does not", () => {
    const found = matchAiApps({
      shortcuts: [shortcut("Assistant", "C:\\Apps\\Grok\\Grok.exe")],
      programs: [],
    });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ id: "grok", launchKind: "shortcut" });
  });

  it("prefers an exact shortcut over a longer one and over the registry", () => {
    const programs: InstalledProgram[] = [
      { name: "Claude", exePath: "C:\\Program Files\\Claude\\Claude.exe" },
    ];
    const found = matchAiApps({
      shortcuts: [shortcut("Claude Desktop"), shortcut("Claude")],
      programs,
    });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      id: "claude",
      source: "shortcut",
      launchPath: expect.stringContaining("\\Claude.lnk"),
    });
  });

  it("uses a registry exe only when no shortcut exists", () => {
    const found = matchAiApps({
      shortcuts: [],
      programs: [{ name: "Cursor", exePath: "C:\\Users\\Mario\\AppData\\Local\\Programs\\cursor\\Cursor.exe" }],
    });
    expect(found).toEqual([
      {
        id: "cursor",
        label: "Cursor",
        source: "uninstall",
        launchKind: "exe",
        launchPath: "C:\\Users\\Mario\\AppData\\Local\\Programs\\cursor\\Cursor.exe",
      },
    ]);
  });

  it("ignores uninstall entries that have no exe or point at an uninstaller", () => {
    const found = matchAiApps({
      shortcuts: [],
      programs: [
        { name: "Ollama" },
        { name: "Ollama", exePath: "C:\\Program Files\\Ollama\\unins000.exe" },
        { name: "Perplexity", exePath: "C:\\Users\\Mario\\AppData\\Local\\Perplexity\\Perplexity.exe" },
      ],
    });
    expect(found.map((app) => app.id)).toEqual(["perplexity"]);
  });

  it("ignores uninstaller shortcuts", () => {
    const found = matchAiApps({
      shortcuts: [
        shortcut("Cursor Uninstall", "C:\\Program Files\\cursor\\unins000.exe"),
        shortcut("Uninstall LM Studio", "C:\\Program Files\\LM Studio\\unins000.exe"),
        shortcut("Cursor", "C:\\Program Files\\cursor\\Cursor.exe"),
      ],
      programs: [],
    });
    expect(found.map((app) => app.id)).toEqual(["cursor"]);
    expect(found[0]?.launchPath).toContain("\\Cursor.lnk");
  });

  it("drops an uninstaller when it is the only shortcut", () => {
    const found = matchAiApps({
      shortcuts: [
        shortcut("Cursor Uninstall", "C:\\Program Files\\cursor\\unins000.exe"),
        shortcut("Uninstall LM Studio"),
      ],
      programs: [],
    });
    expect(found).toEqual([]);
  });

  it("does not match unrelated cursor or copilot names", () => {
    const found = matchAiApps({
      shortcuts: [
        shortcut("Mouse Cursor"),
        shortcut("Cursor Theme"),
        shortcut("GitHub Copilot"),
        shortcut("Copilot Studio"),
      ],
      programs: [],
    });
    expect(found).toEqual([]);
  });

  it("matches Store apps and prefers a shortcut over the same Store app", () => {
    const storeOnly = matchAiApps({
      shortcuts: [],
      programs: [],
      storeApps: [
        { name: "ChatGPT", appId: "OpenAI.ChatGPT-Desktop_2p2nqsdnc2c4m!App" },
        { name: "Copilot", appId: "Microsoft.Copilot_8wekyb3d8bbwe!App" },
        { name: "Notepad", appId: "Microsoft.WindowsNotepad_8wekyb3d8bbwe!App" },
        { name: "ChatGPT", appId: "not an app id" },
      ],
    });
    expect(storeOnly.map((app) => [app.id, app.launchKind, app.launchPath])).toEqual([
      ["chatgpt", "store", "OpenAI.ChatGPT-Desktop_2p2nqsdnc2c4m!App"],
      ["copilot", "store", "Microsoft.Copilot_8wekyb3d8bbwe!App"],
    ]);

    const withShortcut = matchAiApps({
      shortcuts: [shortcut("ChatGPT")],
      programs: [],
      storeApps: [{ name: "ChatGPT", appId: "OpenAI.ChatGPT-Desktop_2p2nqsdnc2c4m!App" }],
    });
    expect(withShortcut[0]).toMatchObject({ id: "chatgpt", source: "shortcut", launchKind: "shortcut" });
  });

  it("does not treat a partial name as a match", () => {
    const found = matchAiApps({
      shortcuts: [shortcut("CursorSensitivity"), shortcut("MyChatGPTApp"), shortcut("Photocopilot")],
      programs: [],
    });
    expect(found).toEqual([]);
  });
});
