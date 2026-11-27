/**
 * Deep think: Jarvis hands big jobs (build a website or app, design in Figma,
 * plan a project, write serious code) to Claude Code running headless in a
 * project folder, and reports back by voice when it is done. The fast Groq
 * model stays in charge of quick commands and decides when to hand off.
 *
 * Everything here is pure so it can be tested; src/main/deep-agent.ts runs it.
 */

export type DeepPermissionMode = "acceptEdits" | "auto";

export interface DeepConfig {
  enabled: boolean;
  /** Where projects go. Unset: <home>\FA26\jarvis-builds, or Documents\jarvis-builds. */
  workspace?: string;
  /** Full path to claude.exe or claude.cmd. Unset: found on PATH and the usual install folders. */
  command?: string;
  /** Claude Code model alias or name, for example "opus" or "sonnet". Unset: your Claude Code default. */
  model?: string;
  /** Stop a run that goes longer than this. */
  maxMinutes: number;
  permissionMode: DeepPermissionMode;
  /** Open the main result (the site, the plan, the Figma link) when a run finishes. */
  openResult: boolean;
}

export const DEFAULT_DEEP: DeepConfig = {
  enabled: true,
  maxMinutes: 45,
  permissionMode: "acceptEdits",
  openResult: true,
};

export type DeepAction = "start" | "status" | "cancel" | "open";

export interface DeepCall {
  tool: "deep_task";
  action: DeepAction;
  project: string;
  task: string;
}

export const DEEP_LIMITS = { task: 4000, project: 60 } as const;

/** "My Portfolio Site!" -> "my-portfolio-site". Empty or odd names become "project". */
export function projectSlug(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return slug || "project";
}

export function parseDeepCall(args: Record<string, unknown>): DeepCall | undefined {
  const action = args.action === undefined ? "start" : args.action;
  if (action !== "start" && action !== "status" && action !== "cancel" && action !== "open") return undefined;
  const project = typeof args.project === "string" ? args.project.trim() : "";
  const task = typeof args.task === "string" ? args.task.replace(/\r\n?/g, "\n").trim() : "";
  if (project.length > DEEP_LIMITS.project || task.length > DEEP_LIMITS.task) return undefined;
  if (action === "start" && (!task || !project)) return undefined;
  if (action === "open" && !project) return undefined;
  return { tool: "deep_task", action, project, task };
}

export function deepTool(): Record<string, unknown> {
  return {
    type: "function",
    function: {
      name: "deep_task",
      description:
        "Hand a big job to Claude Code, a much stronger AI that works for minutes in its own project folder: building a whole website or app, creating a Figma design or UI, writing or fixing a real codebase, planning a project or schedule in detail, or research written up as a document. Use it whenever the user says \"deep think\". It runs in the background and Jarvis announces the result; meanwhile you can keep helping. To change something built before, use the same project name. action open shows a finished project again (its website, plan, or Figma file); action status reports progress and the recent projects; action cancel stops the run.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          action: { type: "string", enum: ["start", "status", "cancel", "open"] },
          project: {
            type: "string",
            description: "Short project name, such as portfolio-site or chem-study-plan. Reuse an earlier name to continue that project.",
          },
          task: {
            type: "string",
            description:
              "The full request in detail, in the user's words plus everything they said that matters (style, colors, pages, deadline). Leave nothing for Claude Code to guess that the user already told you.",
          },
        },
        required: ["action", "project", "task"],
      },
    },
  };
}

export const DEEP_PROMPT =
  'Use deep_task for anything big: building a website, app, or game; a Figma design or UI mockup; real coding in a project; a detailed plan; or a written research report. Always use it when the user says "deep think". Tell the user in one short sentence that deep think is on it and that you will tell them when it is done. When the user wants to see something deep think built before ("open my portfolio site"), use deep_task with action open and that project name.';

/**
 * Commands Claude Code may run without asking. Everything else is denied in a
 * headless run. On Windows, Claude Code runs commands through Git Bash when it
 * is installed and through its PowerShell tool otherwise, and each tool only
 * follows rules written for it, so every command rule is written for both.
 */
const ALLOWED_COMMANDS = [
  "npm *",
  "npx *",
  "pnpm *",
  "yarn *",
  "node *",
  "python *",
  "py *",
  "pip *",
  "git init*",
  "git add *",
  "git commit *",
  "git status*",
  "git diff*",
  "git log*",
] as const;

const DENIED_COMMANDS = [
  "git push*",
  "git remote*",
  "npm publish*",
  "npx vercel*",
  "npx netlify*",
  "curl *",
  "wget *",
] as const;

/** PowerShell's own download commands, blocked the same way curl is. */
const DENIED_POWERSHELL = ["Invoke-WebRequest*", "Invoke-RestMethod*", "iwr *", "irm *", "Start-BitsTransfer*"] as const;

const bothShells = (commands: readonly string[]) =>
  commands.flatMap((command) => [`Bash(${command})`, `PowerShell(${command})`]);

export const DEEP_ALLOW = [...bothShells(ALLOWED_COMMANDS), "WebSearch", "WebFetch", "mcp__figma"];

export const DEEP_DENY = [...bothShells(DENIED_COMMANDS), ...DENIED_POWERSHELL.map((command) => `PowerShell(${command})`)];

/** .claude/settings.local.json for a project folder. Claude Code reads it on every run there. */
export function deepSettings(): Record<string, unknown> {
  return { permissions: { allow: [...DEEP_ALLOW], deny: [...DEEP_DENY] } };
}

export function deepPrompt(input: {
  task: string;
  project: string;
  dir: string;
  now: string;
  followUp: boolean;
}): string {
  return [
    `You are the deep-think builder for JARVIS, a voice assistant on the user's Windows PC.`,
    input.followUp
      ? `The user asked, by voice, for this change to the "${input.project}" project you built before:`
      : `The user asked, by voice, for this new project, "${input.project}":`,
    "",
    input.task,
    "",
    `Your working directory is the project folder: ${input.dir}. Keep every file inside it. Today is ${input.now}.`,
    "Nobody can answer questions while you work, so make sensible choices yourself and mention the important ones in your summary.",
    "",
    "How to work:",
    "- Websites and UI: make them polished, modern, responsive, and accessible. Jarvis shows the result from a local web server rooted at this folder, so use relative paths. A plain site is index.html with its CSS and JavaScript. For a framework app (React, Vite, and so on), set relative asset paths (Vite base: \"./\"), run the build, and point OPEN at the built index.html.",
    "- Never start a dev server, watcher, or any command that keeps running.",
    "- Figma: if the user wants a Figma design and Figma tools are available, create it in Figma and put its link in OPEN. If they are not available, say so in SPOKEN and build an HTML mockup instead.",
    "- Plans, schedules, and research: write a clear Markdown file in the folder, such as PLAN.md.",
    "- Code: make it run. Add a short README.md that says how to run it.",
    "- Never push to a git remote, deploy, publish, send messages or email, buy anything, or touch files outside this folder.",
    "",
    "When you are done, end your final reply with exactly these two lines:",
    "SPOKEN: one or two plain sentences that Jarvis will say out loud about what you made. No markdown, file paths, or links.",
    "OPEN: the relative path of the main file to show (for example index.html, dist/index.html, or PLAN.md), a Figma https link, or NONE.",
  ].join("\n");
}

/** One line of `claude -p --output-format stream-json --verbose`, reduced to what Jarvis shows. */
export type DeepEvent =
  | { kind: "init"; sessionId: string; figma: "connected" | "missing" | "unavailable" }
  | { kind: "step"; text: string }
  | { kind: "result"; ok: boolean; text: string; sessionId?: string; cost?: number; denials: number };

export function parseStreamLine(line: string): DeepEvent[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) return [];
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return [];
  }
  if (event.type === "system" && event.subtype === "init") {
    const servers = Array.isArray(event.mcp_servers) ? (event.mcp_servers as Array<Record<string, unknown>>) : [];
    const figma = servers.find((server) => typeof server.name === "string" && /figma/i.test(server.name));
    return [
      {
        kind: "init",
        sessionId: typeof event.session_id === "string" ? event.session_id : "",
        figma: !figma ? "missing" : figma.status === "connected" || figma.status === "pending" ? "connected" : "unavailable",
      },
    ];
  }
  if (event.type === "assistant") {
    // Subagent messages carry a parent id; the main run's steps are enough for the HUD.
    if (typeof event.parent_tool_use_id === "string") return [];
    const message = event.message as { content?: unknown } | undefined;
    const content = Array.isArray(message?.content) ? (message.content as Array<Record<string, unknown>>) : [];
    const steps: DeepEvent[] = [];
    for (const block of content) {
      if (block.type !== "tool_use" || typeof block.name !== "string") continue;
      const label = stepLabel(block.name, (block.input ?? {}) as Record<string, unknown>);
      if (label) steps.push({ kind: "step", text: label });
    }
    return steps;
  }
  if (event.type === "result") {
    const denials = Array.isArray(event.permission_denials) ? event.permission_denials.length : 0;
    return [
      {
        kind: "result",
        ok: event.is_error !== true && (event.subtype === undefined || event.subtype === "success"),
        text: typeof event.result === "string" ? event.result : "",
        sessionId: typeof event.session_id === "string" ? event.session_id : undefined,
        cost: typeof event.total_cost_usd === "number" ? event.total_cost_usd : undefined,
        denials,
      },
    ];
  }
  return [];
}

function baseName(value: unknown): string {
  if (typeof value !== "string") return "";
  const parts = value.split(/[\\/]/).filter(Boolean);
  return (parts[parts.length - 1] ?? "").slice(0, 40);
}

/** "Write {file_path: ...\\index.html}" -> "writing index.html". Short enough for the HUD. */
export function stepLabel(name: string, input: Record<string, unknown>): string {
  if (name.startsWith("mcp__figma") || /figma/i.test(name)) return "designing in Figma";
  if (name.startsWith("mcp__")) return "using " + name.split("__")[1];
  switch (name) {
    case "Write":
      return `writing ${baseName(input.file_path) || "a file"}`;
    case "Edit":
    case "MultiEdit":
    case "NotebookEdit":
      return `editing ${baseName(input.file_path ?? input.notebook_path) || "a file"}`;
    case "Read":
      return `reading ${baseName(input.file_path) || "a file"}`;
    case "Glob":
    case "Grep":
      return "looking through the files";
    case "Bash":
    case "PowerShell": {
      const command = typeof input.command === "string" ? input.command.trim().split(/\s+/).slice(0, 3).join(" ") : "";
      return command ? `running ${command.slice(0, 40)}` : "running a command";
    }
    case "WebSearch":
      return "searching the web";
    case "WebFetch":
      return "reading a web page";
    case "TodoWrite":
    case "TaskCreate":
    case "TaskUpdate":
      return "planning the steps";
    case "Task":
    case "Agent":
      return "working on a part in parallel";
    default:
      return "";
  }
}

export interface DeepReport {
  spoken: string;
  open?: string;
  /** The rest of the reply, for the log. */
  summary: string;
}

export function finalReport(text: string): DeepReport {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let spoken = "";
  let open: string | undefined;
  const rest: string[] = [];
  for (const line of lines) {
    const spokenMatch = /^\s*\**SPOKEN:?\**:?\s*(.*)$/i.exec(line);
    const openMatch = /^\s*\**OPEN:?\**:?\s*(.*)$/i.exec(line);
    if (spokenMatch) spoken = spokenMatch[1].trim();
    else if (openMatch) {
      const value = openMatch[1].trim().replace(/^[`'"]+|[`'"]+$/g, "");
      if (value && !/^none$/i.test(value)) open = value;
    } else rest.push(line);
  }
  const summary = rest.join("\n").trim();
  if (!spoken) {
    // No SPOKEN line: use the first plain sentence of the reply.
    const plain = summary.replace(/[#*_`>|-]+/g, " ").replace(/\s+/g, " ").trim();
    spoken = (/^(.{10,220}?[.!?])(\s|$)/.exec(plain)?.[1] ?? plain.slice(0, 200)).trim();
  }
  return { spoken: spoken.slice(0, 400), open, summary };
}

export type OpenTarget = { kind: "url"; url: string } | { kind: "file"; path: string };

/**
 * What Jarvis may open from a finished run: a Figma link, a local preview
 * address, or a file inside the project folder. Anything else is ignored.
 */
export interface PathApi {
  join(...parts: string[]): string;
  resolve(...parts: string[]): string;
  relative(from: string, to: string): string;
  isAbsolute(file: string): boolean;
}

export function safeOpenTarget(value: string | undefined, projectDir: string, paths: PathApi): OpenTarget | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const figma = url.protocol === "https:" && (url.hostname === "figma.com" || url.hostname.endsWith(".figma.com"));
      const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
      return figma || local ? { kind: "url", url: url.toString() } : undefined;
    } catch {
      return undefined;
    }
  }
  // Any other scheme (file:, javascript:, ms-settings:) is refused; drive letters are paths.
  if (/^[a-z][a-z0-9+.-]+:/i.test(trimmed)) return undefined;
  const root = paths.resolve(projectDir);
  const file = paths.resolve(root, trimmed);
  const rel = paths.relative(root, file);
  if (rel.startsWith("..") || paths.isAbsolute(rel)) return undefined;
  if (rel !== "" && !/\.(html?|md|txt|pdf|png|jpe?g|svg|gif|webp)$/i.test(file)) return undefined;
  return { kind: "file", path: file };
}

/** Arguments for one headless run. The prompt goes in on stdin, so nothing here needs quoting care. */
export function deepArgs(config: DeepConfig, resumeId?: string): string[] {
  const args = ["-p", "--output-format", "stream-json", "--verbose", "--permission-mode", config.permissionMode];
  if (resumeId && /^[A-Za-z0-9-]{8,80}$/.test(resumeId)) args.push("--resume", resumeId);
  if (config.model && /^[A-Za-z0-9._\-[\]]{1,60}$/.test(config.model)) args.push("--model", config.model);
  return args;
}

/** cmd.exe quoting for a .cmd launcher. Only plain arguments reach here (see deepArgs). */
export function cmdQuote(arg: string): string {
  return /^[A-Za-z0-9._\-:\\/=[\]]+$/.test(arg) ? arg : `"${arg.replace(/"/g, '""')}"`;
}

export function readDeepConfig(value: unknown, warnings: string[]): DeepConfig {
  const deep: DeepConfig = { ...DEFAULT_DEEP };
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    warnings.push('deep must be an object like { "enabled": true }; using the defaults');
    return deep;
  }
  const input = value as Record<string, unknown>;
  if (input.enabled !== undefined) {
    if (typeof input.enabled === "boolean") deep.enabled = input.enabled;
    else warnings.push("deep.enabled must be true or false; leaving deep think on");
  }
  for (const key of ["workspace", "command", "model"] as const) {
    const raw = input[key];
    if (raw === undefined) continue;
    if (typeof raw === "string" && raw.trim() && raw.trim().length <= 260) deep[key] = raw.trim();
    else warnings.push(`deep.${key} must be text; leaving it out`);
  }
  if (input.maxMinutes !== undefined) {
    const minutes = input.maxMinutes;
    if (typeof minutes === "number" && minutes >= 2 && minutes <= 240) deep.maxMinutes = Math.round(minutes);
    else warnings.push("deep.maxMinutes must be a number from 2 to 240; using 45");
  }
  if (input.permissionMode !== undefined) {
    if (input.permissionMode === "acceptEdits" || input.permissionMode === "auto") deep.permissionMode = input.permissionMode;
    else warnings.push('deep.permissionMode must be "acceptEdits" or "auto"; using "acceptEdits"');
  }
  if (input.openResult !== undefined) {
    if (typeof input.openResult === "boolean") deep.openResult = input.openResult;
    else warnings.push("deep.openResult must be true or false; leaving it on");
  }
  return deep;
}
