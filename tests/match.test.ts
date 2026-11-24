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
    ]);
    expect(found.every((app) => app.source === "shortcut" && app.launchKind === "shortcut")).toBe(true);
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

  it("does not treat a partial name as a match", () => {
    const found = matchAiApps({
      shortcuts: [shortcut("CursorSensitivity"), shortcut("MyChatGPTApp"), shortcut("Photocopilot")],
      programs: [],
    });
    expect(found).toEqual([]);
  });
});
