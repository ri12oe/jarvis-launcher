/**
 * HUD icons by kind of app, not by brand. Every browser gets the browser
 * glyph, every code editor the code glyph, and so on, so an app added later
 * (Chrome, Discord, Steam) matches the rest of the HUD with no new artwork.
 *
 * config.json can pick a kind for any tile:
 *   "icons": { "chrome": "browser", "claude": "ai-orbit" }
 * and "iconStyle": "app" shows the apps' own icons instead.
 */

export const HUD_ICON_KINDS = [
  "browser",
  "files",
  "music",
  "mail",
  "repo",
  "social",
  "chat",
  "ai-spark",
  "ai-chat",
  "ai-orbit",
  "ai-neural",
  "code",
  "document",
  "spreadsheet",
  "slides",
  "notes",
  "pdf",
  "design",
  "video",
  "call",
  "game",
  "terminal",
  "settings",
  "store",
  "photos",
  "camera",
  "calendar",
  "calculator",
  "cloud",
  "maps",
  "security",
  "app",
] as const;

export type HudIconKind = (typeof HUD_ICON_KINDS)[number];

export type IconStyle = "hud" | "app";

export function isHudIconKind(value: unknown): value is HudIconKind {
  return typeof value === "string" && (HUD_ICON_KINDS as readonly string[]).includes(value);
}

/**
 * Words that pick a kind, checked in order. Longer, more specific names come
 * first, so "google drive" is cloud before "google" is browser, and
 * "github desktop" is repo before "desktop" means anything.
 */
const RULES: readonly (readonly [HudIconKind, readonly string[]])[] = [
  ["cloud", ["google drive", "onedrive", "dropbox", "icloud", "box drive", "mega"]],
  ["document", ["google docs", "microsoft docs", "ms docs", "microsoft doc", "word", "wordpad", "pages", "libreoffice writer", "docs", "doc"]],
  ["spreadsheet", ["google sheets", "excel", "sheets", "numbers", "calc", "spreadsheet"]],
  ["slides", ["google slides", "powerpoint", "slides", "keynote", "impress", "presentation"]],
  ["maps", ["google maps", "maps", "earth"]],
  ["call", ["google meet", "zoom", "meet", "webex", "skype", "facetime"]],
  ["mail", ["outlook", "gmail", "thunderbird", "mail", "proton mail", "spark mail", "email"]],
  ["repo", ["github", "gitlab", "bitbucket", "sourcetree", "gitkraken", "git"]],
  [
    "code",
    [
      "vs code",
      "v3 code",
      "vscode",
      "visual studio",
      "code",
      "cursor",
      "windsurf",
      "sublime",
      "notepad++",
      "atom",
      "intellij",
      "pycharm",
      "webstorm",
      "rider",
      "clion",
      "android studio",
      "xcode",
      "zed",
      "vim",
      "neovim",
      "eclipse",
      "jetbrains",
    ],
  ],
  ["ai-spark", ["claude", "perplexity", "poe"]],
  ["ai-chat", ["copilot", "chatgpt", "openai", "le chat"]],
  ["ai-orbit", ["grok", "deepseek", "mistral"]],
  ["ai-neural", ["gemini", "gemmi", "bard", "llama", "ollama", "lm studio", "ai"]],
  ["terminal", ["windows terminal", "terminal", "powershell", "command prompt", "cmd", "wsl", "ubuntu", "bash"]],
  [
    "browser",
    [
      "microsoft edge",
      "google chrome",
      "edge",
      "chrome",
      "chromium",
      "firefox",
      "brave",
      "opera",
      "vivaldi",
      "safari",
      "arc",
      "tor browser",
      "browser",
      "internet",
      "google",
    ],
  ],
  ["files", ["file explorer", "explorer", "files", "finder", "folder", "downloads", "documents", "desktop"]],
  ["music", ["spotify", "spoftiy", "apple music", "itunes", "tidal", "deezer", "soundcloud", "music", "audacity", "amazon music"]],
  ["social", ["twitter", "facebook", "instagram", "threads", "bluesky", "mastodon", "reddit", "linkedin", "tiktok", "x"]],
  ["chat", ["discord", "slack", "teams", "whatsapp", "telegram", "messenger", "signal", "messages", "chat"]],
  ["video", ["youtube", "netflix", "vlc", "twitch", "prime video", "disney", "hulu", "plex", "media player", "obs", "video"]],
  ["game", ["steam", "epic games", "xbox", "battle.net", "riot", "minecraft", "roblox", "ea app", "gog", "game"]],
  ["design", ["figma", "photoshop", "illustrator", "gimp", "canva", "blender", "affinity", "inkscape", "krita", "paint"]],
  ["pdf", ["acrobat", "pdf"]],
  ["notes", ["onenote", "notion", "obsidian", "evernote", "sticky notes", "notepad", "notes", "keep"]],
  ["settings", ["control panel", "settings"]],
  ["store", ["microsoft store", "app store", "store", "amazon"]],
  ["photos", ["photos", "pictures", "lightroom", "gallery"]],
  ["camera", ["camera", "webcam"]],
  ["calendar", ["calendar"]],
  ["calculator", ["calculator"]],
  ["security", ["defender", "security", "vpn", "bitwarden", "1password", "keepass", "authenticator", "norton", "malwarebytes"]],
];

function escape(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const MATCHERS = RULES.map(
  ([kind, words]) => [kind, words.map((word) => new RegExp(`(^|[^a-z0-9+])${escape(word)}($|[^a-z0-9+])`))] as const,
);

/** The kind for an app from its id, label, and design name. Unknown apps get the generic app glyph. */
export function hudIconKind(...names: readonly (string | undefined)[]): HudIconKind {
  const text = names
    .filter((name): name is string => Boolean(name))
    .map((name) => name.toLowerCase().replace(/[-_]/g, " "))
    .join(" | ");
  for (const [kind, patterns] of MATCHERS) {
    if (patterns.some((pattern) => pattern.test(text))) return kind;
  }
  return "app";
}

/** Picks the kind for a tile: a config choice by id or label first, then the rules. */
export function iconForTile(
  overrides: Readonly<Record<string, HudIconKind>> | undefined,
  id: string | undefined,
  label: string | undefined,
  designName?: string,
): HudIconKind {
  if (overrides) {
    for (const key of [id, label, designName]) {
      if (!key) continue;
      const exact = overrides[key] ?? overrides[key.toLowerCase()];
      if (exact) return exact;
    }
  }
  return hudIconKind(id, label, designName);
}
