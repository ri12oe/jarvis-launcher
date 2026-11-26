/**
 * Computer control for the voice assistant: the tools the model may call, the
 * checks on their arguments, and the spoken plan line. Nothing here touches
 * the PC; src/main/computer.ts runs the checked calls.
 *
 * Hard limits, by design: no tool sends a message or email, deletes a file,
 * closes an app, or buys anything. Keys are an allow list. Files are only
 * created, never overwritten, inside the Jarvis Projects folder.
 */

export const SETTINGS_PAGES = {
  display: "ms-settings:display",
  sound: "ms-settings:sound",
  bluetooth: "ms-settings:bluetooth",
  wifi: "ms-settings:network-wifi",
  network: "ms-settings:network",
  notifications: "ms-settings:notifications",
  focus: "ms-settings:quiethours",
  power: "ms-settings:powersleep",
  battery: "ms-settings:batterysaver",
  background: "ms-settings:personalization-background",
  colors: "ms-settings:personalization-colors",
  themes: "ms-settings:themes",
  nightlight: "ms-settings:nightlight",
  mouse: "ms-settings:mousetouchpad",
  keyboard: "ms-settings:typing",
  apps: "ms-settings:appsfeatures",
  defaultapps: "ms-settings:defaultapps",
  startup: "ms-settings:startupapps",
  privacy: "ms-settings:privacy",
  update: "ms-settings:windowsupdate",
  storage: "ms-settings:storagesense",
  about: "ms-settings:about",
  datetime: "ms-settings:dateandtime",
  language: "ms-settings:regionlanguage",
  accounts: "ms-settings:yourinfo",
} as const;

export type SettingsPage = keyof typeof SETTINGS_PAGES;

/** Virtual-key codes. */
const VK = {
  ctrl: 0x11,
  shift: 0x10,
  alt: 0x12,
  win: 0x5b,
  enter: 0x0d,
  tab: 0x09,
  escape: 0x1b,
  backspace: 0x08,
  space: 0x20,
  pageup: 0x21,
  pagedown: 0x22,
  end: 0x23,
  home: 0x24,
  left: 0x25,
  up: 0x26,
  right: 0x27,
  down: 0x28,
  f5: 0x74,
  backtick: 0xc0,
} as const;

function letter(char: string): number {
  return char.toUpperCase().charCodeAt(0);
}

/**
 * Keys the model may press. Send shortcuts (Ctrl+Enter, Alt+S), closing
 * (Alt+F4, Ctrl+W), select-all, and delete are left out on purpose.
 */
export const KEY_COMBOS: Record<string, readonly number[]> = {
  enter: [VK.enter],
  tab: [VK.tab],
  "shift+tab": [VK.shift, VK.tab],
  escape: [VK.escape],
  backspace: [VK.backspace],
  space: [VK.space],
  up: [VK.up],
  down: [VK.down],
  left: [VK.left],
  right: [VK.right],
  home: [VK.home],
  end: [VK.end],
  pageup: [VK.pageup],
  pagedown: [VK.pagedown],
  f5: [VK.f5],
  "ctrl+n": [VK.ctrl, letter("n")],
  "ctrl+s": [VK.ctrl, letter("s")],
  "ctrl+t": [VK.ctrl, letter("t")],
  "ctrl+l": [VK.ctrl, letter("l")],
  "ctrl+f": [VK.ctrl, letter("f")],
  "ctrl+c": [VK.ctrl, letter("c")],
  "ctrl+v": [VK.ctrl, letter("v")],
  "ctrl+z": [VK.ctrl, letter("z")],
  "ctrl+y": [VK.ctrl, letter("y")],
  "ctrl+b": [VK.ctrl, letter("b")],
  "ctrl+i": [VK.ctrl, letter("i")],
  "ctrl+u": [VK.ctrl, letter("u")],
  "ctrl+shift+p": [VK.ctrl, VK.shift, letter("p")],
  "ctrl+`": [VK.ctrl, VK.backtick],
};

export const CODE_EXTENSIONS = [
  "py",
  "js",
  "ts",
  "html",
  "css",
  "txt",
  "md",
  "json",
  "java",
  "c",
  "cpp",
  "cs",
  "go",
  "rs",
  "rb",
  "php",
  "sh",
  "sql",
] as const;

export const LIMITS = {
  code: 8000,
  text: 4000,
  emailBody: 4000,
  subject: 200,
  query: 200,
  appName: 80,
} as const;

export type ComputerCall =
  | { tool: "open_app"; name: string }
  | { tool: "open_settings"; page: SettingsPage }
  | { tool: "set_theme"; mode: "dark" | "light" }
  | { tool: "write_code"; filename: string; code: string }
  | { tool: "draft_email"; to: string; subject: string; body: string }
  | { tool: "spotify_search"; query: string }
  | { tool: "type_text"; text: string }
  | { tool: "press_keys"; keys: string }
  | { tool: "wait"; seconds: number };

export const COMPUTER_TOOL_NAMES = [
  "open_app",
  "open_settings",
  "set_theme",
  "write_code",
  "draft_email",
  "spotify_search",
  "type_text",
  "press_keys",
  "wait",
] as const;

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.replace(/\r\n?/g, "\n");
  if (!trimmed.trim() || trimmed.length > max) return undefined;
  return trimmed;
}

/** A plain name like hello.py. Folders, odd characters, and unknown extensions are refused. */
export function safeFilename(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const name = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9 _.-]{0,58}$/.test(name)) return undefined;
  if (name.includes("..")) return undefined;
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (
    !name.includes(".") ||
    !(CODE_EXTENSIONS as readonly string[]).includes(ext)
  )
    return undefined;
  return name;
}

/** One or more addresses separated by commas or semicolons. */
export function safeEmailList(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const parts = value
    .split(/[;,]/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0 || parts.length > 5) return undefined;
  const email = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
  if (!parts.every((part) => email.test(part))) return undefined;
  return parts.join(";");
}

/** Check one tool call from the model. Undefined means it is refused. */
export function parseComputerCall(
  name: unknown,
  args: Record<string, unknown>,
): ComputerCall | undefined {
  switch (name) {
    case "open_app": {
      const app = text(args.name, LIMITS.appName);
      return app ? { tool: "open_app", name: app.trim() } : undefined;
    }
    case "open_settings": {
      const page =
        typeof args.page === "string" ? args.page.trim().toLowerCase() : "";
      return Object.prototype.hasOwnProperty.call(SETTINGS_PAGES, page)
        ? { tool: "open_settings", page: page as SettingsPage }
        : undefined;
    }
    case "set_theme":
      return args.mode === "dark" || args.mode === "light"
        ? { tool: "set_theme", mode: args.mode }
        : undefined;
    case "write_code": {
      const filename = safeFilename(args.filename);
      const code = text(args.code, LIMITS.code);
      return filename && code
        ? { tool: "write_code", filename, code }
        : undefined;
    }
    case "draft_email": {
      const to = safeEmailList(args.to);
      const subject =
        typeof args.subject === "string"
          ? args.subject.replace(/\s+/g, " ").trim()
          : "";
      const body = text(args.body, LIMITS.emailBody);
      if (!to || !body || subject.length > LIMITS.subject) return undefined;
      return { tool: "draft_email", to, subject, body };
    }
    case "spotify_search": {
      const query = text(args.query, LIMITS.query);
      return query
        ? { tool: "spotify_search", query: query.trim() }
        : undefined;
    }
    case "type_text": {
      const value = text(args.text, LIMITS.text);
      return value ? { tool: "type_text", text: value } : undefined;
    }
    case "press_keys": {
      const keys =
        typeof args.keys === "string"
          ? args.keys.trim().toLowerCase().replace(/\s+/g, "")
          : "";
      return Object.prototype.hasOwnProperty.call(KEY_COMBOS, keys)
        ? { tool: "press_keys", keys }
        : undefined;
    }
    case "wait": {
      const seconds =
        typeof args.seconds === "number" ? args.seconds : Number(args.seconds);
      if (!Number.isFinite(seconds)) return undefined;
      return { tool: "wait", seconds: Math.max(0.2, Math.min(5, seconds)) };
    }
    default:
      return undefined;
  }
}

/** The spoken plan for a list of calls, used when the model gave no words of its own. */
export function planLine(calls: readonly ComputerCall[]): string {
  const first = calls[0];
  if (!first) return "";
  switch (first.tool) {
    case "write_code":
      return `Opening VS Code and writing ${first.filename}.`;
    case "draft_email":
      return `Drafting an email to ${first.to.split(";")[0]}.`;
    case "spotify_search":
      return `Searching Spotify for ${first.query}.`;
    case "open_app":
      return `Opening ${first.name}.`;
    case "open_settings":
      return `Opening ${first.page} settings.`;
    case "set_theme":
      return `Switching to ${first.mode} mode.`;
    case "type_text":
      return "Typing that now.";
    default:
      return "On it.";
  }
}

/** mailto: with To and Subject. The body is typed in, so the user sees it written. */
export function mailtoUrl(to: string, subject: string, body?: string): string {
  const params: string[] = [];
  if (subject) params.push(`subject=${encodeURIComponent(subject)}`);
  if (body) params.push(`body=${encodeURIComponent(body)}`);
  const recipients = to
    .split(";")
    .map((address) => encodeURIComponent(address))
    .join(",");
  return `mailto:${recipients}${params.length ? `?${params.join("&")}` : ""}`;
}

export function spotifySearchUrl(query: string): string {
  return `spotify:search:${encodeURIComponent(query)}`;
}

export function spotifyWebSearchUrl(query: string): string {
  return `https://open.spotify.com/search/${encodeURIComponent(query)}`;
}

/**
 * Lines to type for code. Leading tabs become four spaces, since the Jarvis
 * Projects workspace turns off auto-indent and auto-closing brackets.
 */
export function codeLines(code: string): string[] {
  const lines = code.replace(/\r\n?/g, "\n").replace(/\n+$/, "").split("\n");
  return lines.map((line) => {
    const match = /^[\t ]*/.exec(line)?.[0] ?? "";
    return (
      match.replace(/\t/g, "    ") +
      line.slice(match.length).replace(/\s+$/, "")
    );
  });
}

/** Plain text lines, for emails and other apps. */
export function textLines(value: string): string[] {
  return value.replace(/\r\n?/g, "\n").replace(/\n+$/, "").split("\n");
}

/**
 * Workspace settings for the Jarvis Projects folder, so VS Code types exactly
 * what Jarvis sends: no auto-closing brackets, no auto-indent, and no
 * suggestion accepted by Enter. They apply only inside that folder.
 */
const TYPING_EDITOR = {
  "editor.autoClosingBrackets": "never",
  "editor.autoClosingQuotes": "never",
  "editor.autoClosingOvertype": "never",
  "editor.autoSurround": "never",
  "editor.autoIndent": "none",
  "editor.formatOnType": false,
  "editor.formatOnPaste": false,
  "editor.formatOnSave": false,
} as const;

/**
 * Language settings beat plain ones, and extensions such as Python (Pylance)
 * turn on indent-as-you-type for their language. So the overrides are repeated
 * for each language Jarvis writes.
 */
const TYPING_LANGUAGES = [
  "python",
  "javascript",
  "typescript",
  "html",
  "css",
  "json",
  "markdown",
  "java",
  "c",
  "cpp",
  "csharp",
  "go",
  "rust",
  "ruby",
  "php",
  "shellscript",
  "sql",
  "plaintext",
];

export const JARVIS_WORKSPACE_SETTINGS: Record<string, unknown> = {
  ...TYPING_EDITOR,
  "editor.acceptSuggestionOnEnter": "off",
  "editor.quickSuggestions": { other: false, comments: false, strings: false },
  "editor.suggestOnTriggerCharacters": false,
  "editor.inlineSuggest.enabled": false,
  "editor.tabCompletion": "off",
  "python.analysis.autoIndent": false,
  "github.copilot.enable": { "*": false },
  ...Object.fromEntries(
    TYPING_LANGUAGES.map((language) => [`[${language}]`, { ...TYPING_EDITOR }]),
  ),
};

/**
 * Jarvis's typing settings laid over an existing settings.json, keeping any
 * other keys. Undefined when the file is not a JSON object, so it is left alone.
 */
export function mergeWorkspaceSettings(
  existing: string | undefined,
): string | undefined {
  let current: Record<string, unknown> = {};
  if (existing !== undefined && existing.trim()) {
    try {
      const parsed = JSON.parse(existing) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        return undefined;
      current = parsed as Record<string, unknown>;
    } catch {
      return undefined;
    }
  }
  return `${JSON.stringify({ ...current, ...JARVIS_WORKSPACE_SETTINGS }, null, 2)}\n`;
}

/** Process names of apps Jarvis types into. */
export const VSCODE_PROCESSES = ["Code"] as const;
export const OUTLOOK_PROCESSES = ["OUTLOOK", "olk"] as const;

/** Tool schemas for the chat request. */
export function computerTools(): Record<string, unknown>[] {
  const fn = (
    name: string,
    description: string,
    properties: Record<string, unknown>,
    required: string[],
  ) => ({
    type: "function",
    function: {
      name,
      description,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties,
        required,
      },
    },
  });
  return [
    fn(
      "open_app",
      "Open an installed app by name, such as Notepad, Calculator, Spotify, Outlook, or Word.",
      { name: { type: "string" } },
      ["name"],
    ),
    fn(
      "open_settings",
      "Open a Windows Settings page.",
      { page: { type: "string", enum: Object.keys(SETTINGS_PAGES) } },
      ["page"],
    ),
    fn(
      "set_theme",
      "Switch Windows between dark mode and light mode.",
      { mode: { type: "string", enum: ["dark", "light"] } },
      ["mode"],
    ),
    fn(
      "write_code",
      "Open VS Code, create a new file in the Jarvis Projects folder, type the code live, and save it. Use this for any request to write code.",
      {
        filename: {
          type: "string",
          description: `A plain file name with one of: ${CODE_EXTENSIONS.join(", ")}`,
        },
        code: {
          type: "string",
          description:
            "The complete file contents, with real newlines and indentation.",
        },
      },
      ["filename", "code"],
    ),
    fn(
      "draft_email",
      "Open a new email draft in Outlook with the recipient and subject, and type the message live. It never sends; the user presses Send.",
      {
        to: {
          type: "string",
          description: "Email address. Ask the user if you do not know it.",
        },
        subject: { type: "string" },
        body: {
          type: "string",
          description: "The whole message, with a greeting and a sign-off.",
        },
      },
      ["to", "subject", "body"],
    ),
    fn(
      "spotify_search",
      "Open Spotify on the search results for a song, artist, album, or playlist. The user presses play.",
      { query: { type: "string" } },
      ["query"],
    ),
    fn(
      "type_text",
      "Type text into the app that was just opened, or the window in front. Use \\n for new lines.",
      { text: { type: "string" } },
      ["text"],
    ),
    fn(
      "press_keys",
      "Press a key or shortcut in the window in front.",
      { keys: { type: "string", enum: Object.keys(KEY_COMBOS) } },
      ["keys"],
    ),
    fn(
      "wait",
      "Wait a moment for an app to load, from 0.2 to 5 seconds.",
      { seconds: { type: "number" } },
      ["seconds"],
    ),
  ];
}
