import { describe, expect, it } from "vitest";
import { HUD_ICON_KINDS, hudIconKind, iconForTile, isHudIconKind } from "../src/shared/hud-icons";
import { parseConfig } from "../src/shared/config";

describe("HUD icon kinds", () => {
  it("gives each of the HUD's apps an icon by kind", () => {
    expect(hudIconKind("edge", "Microsoft Edge")).toBe("browser");
    expect(hudIconKind("explorer", "File Explorer")).toBe("files");
    expect(hudIconKind("spotify", "Spotify", "Spotify")).toBe("music");
    expect(hudIconKind("outlook", "Outlook")).toBe("mail");
    expect(hudIconKind("github", "GitHub")).toBe("repo");
    expect(hudIconKind("x", "X")).toBe("social");
    expect(hudIconKind("claude", "Claude")).toBe("ai-spark");
    expect(hudIconKind("copilot", "Copilot")).toBe("ai-chat");
    expect(hudIconKind("grok", "Grok")).toBe("ai-orbit");
    expect(hudIconKind("gemini", "Gemini")).toBe("ai-neural");
    expect(hudIconKind("vscode", "Visual Studio Code")).toBe("code");
    expect(hudIconKind("word", "Word", "Word")).toBe("document");
  });

  it("matches apps added later to the same set", () => {
    expect(hudIconKind("chrome", "Google Chrome")).toBe("browser");
    expect(hudIconKind(undefined, "Firefox")).toBe("browser");
    expect(hudIconKind(undefined, "Discord")).toBe("chat");
    expect(hudIconKind(undefined, "Steam")).toBe("game");
    expect(hudIconKind(undefined, "Figma")).toBe("design");
    expect(hudIconKind(undefined, "Google Drive")).toBe("cloud");
    expect(hudIconKind(undefined, "Google Docs")).toBe("document");
    expect(hudIconKind(undefined, "Notepad++")).toBe("code");
    expect(hudIconKind(undefined, "Notepad")).toBe("notes");
    expect(hudIconKind(undefined, "Xbox")).toBe("game");
    expect(hudIconKind(undefined, "1Password")).toBe("security");
    expect(hudIconKind(undefined, "Some Unknown Tool")).toBe("app");
  });

  it("lets config.json pick any icon for a tile", () => {
    const { config, warnings } = parseConfig({
      icons: { Chrome: "browser", claude: "ai-orbit", odd: "rocket" },
      iconStyle: "hud",
    });
    expect(config.icons).toEqual({ chrome: "browser", claude: "ai-orbit" });
    expect(config.iconStyle).toBe("hud");
    expect(warnings.join(" ")).toMatch(/icons.odd: unknown icon "rocket"/);
    expect(iconForTile(config.icons, "claude", "Claude")).toBe("ai-orbit");
    expect(iconForTile(config.icons, "chrome-beta", "Chrome")).toBe("browser");
    expect(parseConfig({ iconStyle: "fancy" }).warnings.join(" ")).toMatch(/iconStyle/);
    expect(parseConfig({}).config.iconStyle).toBeUndefined();
  });

  it("knows every kind it draws", () => {
    for (const kind of HUD_ICON_KINDS) expect(isHudIconKind(kind)).toBe(true);
    expect(isHudIconKind("rocket")).toBe(false);
  });
});
