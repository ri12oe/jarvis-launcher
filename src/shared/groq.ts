import { checkSystemAction, type SystemAction } from "./system";
import type { VoiceTile } from "./voice-command";

/** Groq's OpenAI-compatible API. The free plan needs no card. */
export const GROQ_API_ROOT = "https://api.groq.com/openai/v1";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** One PC control the model asked for, already checked and clamped. */
export interface PcAction {
  action: SystemAction;
  value: number;
}

export interface ChatResult {
  text: string;
  /** Set only when the model called open_tile with an id from the allow list. */
  tileId?: string;
  /** PC controls from pc_control calls. Power actions are never offered. */
  pc: PcAction[];
  /** Set when the model asked to look something up on the web. */
  search?: string;
}

/**
 * Spoken names for the PC controls the voice may use. Sleep, restart, shut
 * down, sign out, and emptying the bin are left out on purpose: a misheard
 * word should never lose work.
 */
const PC_CONTROLS: Record<string, { action: SystemAction; value?: "level" | "step" }> = {
  volume_set: { action: "volume-set", value: "level" },
  volume_change: { action: "volume-step", value: "step" },
  mute_toggle: { action: "mute-toggle" },
  mic_mute_toggle: { action: "mic-toggle" },
  media_play_pause: { action: "media-toggle" },
  media_next: { action: "media-next" },
  media_previous: { action: "media-prev" },
  brightness_set: { action: "brightness-set", value: "level" },
};

export const PC_CONTROL_NAMES = Object.keys(PC_CONTROLS);

/** Read one pc_control call into a checked action, or undefined when it is not allowed. */
export function readPcControl(name: unknown, value: unknown): PcAction | undefined {
  if (typeof name !== "string" || !Object.prototype.hasOwnProperty.call(PC_CONTROLS, name)) return undefined;
  const control = PC_CONTROLS[name];
  const number = typeof value === "string" ? Number(value) : value;
  if (control.value && (typeof number !== "number" || !Number.isFinite(number))) return undefined;
  const checked = checkSystemAction(control.action, control.value ? number : 0);
  return checked ?? undefined;
}

/** A short spoken line for a PC control, used when the model gave no words. */
export function describePc(actions: readonly PcAction[]): string {
  const first = actions[0];
  if (!first) return "";
  switch (first.action) {
    case "volume-set":
      return `Volume at ${first.value} percent.`;
    case "volume-step":
      return first.value >= 0 ? "Turning it up." : "Turning it down.";
    case "brightness-set":
      return `Brightness at ${first.value} percent.`;
    case "media-next":
      return "Next track.";
    case "media-prev":
      return "Previous track.";
    case "media-toggle":
      return "Done.";
    default:
      return "Done.";
  }
}

export class GroqError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GroqError";
  }
}

/** "Thursday, November 26, 2026 at 1:41 PM" in this PC's time zone. */
export function spokenNow(now: Date): string {
  return now.toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function jarvisSystemPrompt(tiles: readonly VoiceTile[], now: Date = new Date()): string {
  const list = tiles.map((tile) => `${tile.id} (${tile.label})`).join(", ");
  return [
    "You are JARVIS, a capable, witty AI assistant who lives in the user's Windows PC and speaks out loud.",
    // The model has no clock. Without this it guesses the date from its training data.
    `The local date and time right now is ${spokenNow(now)}. Use it when asked the day, date, or time.`,
    "Your reply is read aloud, so write plain spoken sentences: no markdown, lists, tables, URLs, or emoji.",
    "Answer as smartly and accurately as you can. Keep most replies to one to three sentences, and go to five or six only when the user asks you to explain something.",
    "Use the earlier messages for follow-up questions.",
    "Tools: open_tile opens one launcher tile. Use only an id from this list:",
    list || "(no tiles)",
    "pc_control changes the volume (0 to 100, or a change such as +10 or -10), mutes or unmutes, mutes the mic, plays, pauses, or skips media, or sets the screen brightness.",
    "web_search looks things up online. Use it for news, weather, sports, prices, and anything that may have changed recently or that you are not sure of.",
    "Do not invent tiles. If the user is only chatting, do not call a tool.",
  ].join(" ");
}

export function appendChatHistory(history: readonly ChatMessage[], user: string, assistant: string): ChatMessage[] {
  const next = history.concat(
    { role: "user", content: clip(user) },
    { role: "assistant", content: clip(assistant) },
  );
  // Ten exchanges, so follow-up questions have context.
  return next.slice(-20);
}

function clip(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > 600 ? `${trimmed.slice(0, 600)}…` : trimmed;
}

export function redactSecret(text: string, secret: string): string {
  if (!secret) return text;
  return text.split(secret).join("[redacted]");
}

interface ToolCall {
  function?: { name?: string; arguments?: unknown };
}

interface ChatPayload {
  choices?: Array<{
    message?: {
      content?: unknown;
      tool_calls?: ToolCall[];
    };
  }>;
}

/** Keep a tool call only when its tile id was one we offered. */
export function parseChatCompletion(payload: unknown, allowedIds: readonly string[]): ChatResult {
  if (!payload || typeof payload !== "object") throw new GroqError("Groq request failed (bad response)");
  const message = (payload as ChatPayload).choices?.[0]?.message;
  if (!message) throw new GroqError("Groq request failed (bad response)");
  const allowed = new Set(allowedIds);
  const tileId = readOpenTile(message.tool_calls, allowed);
  const pc: PcAction[] = [];
  let search: string | undefined;
  for (const call of message.tool_calls ?? []) {
    const name = call.function?.name;
    if (name !== "pc_control" && name !== "web_search") continue;
    const args = parseArguments(call.function?.arguments);
    if (!args) continue;
    if (name === "pc_control") {
      const action = readPcControl(args.action, args.value);
      if (action && pc.length < 4) pc.push(action);
    } else if (search === undefined && typeof args.query === "string" && args.query.trim()) {
      search = args.query.trim().slice(0, 300);
    }
  }
  return { text: typeof message.content === "string" ? message.content.trim() : "", tileId, pc, search };
}

function readOpenTile(calls: ToolCall[] | undefined, allowed: ReadonlySet<string>): string | undefined {
  if (!calls) return undefined;
  for (const call of calls) {
    if (call.function?.name !== "open_tile") continue;
    const args = parseArguments(call.function.arguments);
    if (!args) continue;
    const raw = args.tile_id ?? args.tileId;
    if (typeof raw !== "string") continue;
    const id = raw.trim();
    if (allowed.has(id)) return id;
  }
  return undefined;
}

function parseArguments(value: unknown): Record<string, unknown> | undefined {
  let parsed: unknown = value;
  if (typeof value === "string") {
    if (value.length > 4000) return undefined;
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return undefined;
    }
  }
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed) as unknown;
    } catch {
      return undefined;
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
  return parsed as Record<string, unknown>;
}

export interface GroqRequest {
  apiKey: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

function apiFetch(url: string, apiKey: string, init: RequestInit, fetchImpl: typeof fetch | undefined): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${apiKey}`);
  const request = () => (fetchImpl ?? fetch)(url, { ...init, headers });
  return request().then(
    (response) => {
      if (response.ok) return response;
      return response.arrayBuffer().then(
        () => {
          throw new GroqError(`Groq request failed (${response.status})`);
        },
        () => {
          throw new GroqError(`Groq request failed (${response.status})`);
        },
      );
    },
    () => {
      throw new GroqError("Groq request failed (network)");
    },
  );
}

export async function completeChat(
  input: GroqRequest & { model: string; messages: readonly ChatMessage[]; tileIds: readonly string[] },
): Promise<ChatResult> {
  const tileIds = [...new Set(input.tileIds.filter((id) => id.length > 0))];
  const body: Record<string, unknown> = {
    model: input.model,
    messages: input.messages,
    temperature: 0.5,
    // gpt-oss models think before they answer. Give it room, and keep the thinking out of the reply.
    max_completion_tokens: 1500,
    reasoning_effort: "medium",
    include_reasoning: false,
    tools: [...(tileIds.length > 0 ? [openTileTool(tileIds)] : []), pcControlTool(), webSearchTool()],
    tool_choice: "auto",
  };
  const response = await apiFetch(
    `${GROQ_API_ROOT}/chat/completions`,
    input.apiKey,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: input.signal,
    },
    input.fetchImpl,
  );
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new GroqError("Groq request failed (bad response)");
  }
  return parseChatCompletion(payload, tileIds);
}

function pcControlTool(): Record<string, unknown> {
  return {
    type: "function",
    function: {
      name: "pc_control",
      description:
        "Control this PC. volume_set and brightness_set take a value from 0 to 100. volume_change takes a change from -100 to 100. The rest take no value.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          action: { type: "string", enum: PC_CONTROL_NAMES },
          value: { type: "number" },
        },
        required: ["action"],
      },
    },
  };
}

function webSearchTool(): Record<string, unknown> {
  return {
    type: "function",
    function: {
      name: "web_search",
      description: "Look something up on the web. Use it for anything current or uncertain.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
  };
}

/** Make web answers speakable: drop citation marks like 【2†L6-L10】, links, and markdown. */
export function spokenText(text: string, max = 700): string {
  let clean = text
    .replace(/【[^】]*】/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_#`>|]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length > max) {
    // A search answer comes after the page snippets, so keep the end.
    const tail = clean.slice(-max);
    const start = tail.search(/[.!?]\s+[A-Z]/);
    clean = start >= 0 ? tail.slice(start + 1).trim() : tail.trim();
  }
  return clean;
}

/** Answer a question with Groq's built-in browser search. */
export async function searchAnswer(
  input: GroqRequest & { model: string; question: string; history: readonly ChatMessage[]; now?: Date },
): Promise<string> {
  const body = {
    model: input.model,
    messages: [
      {
        role: "system",
        content: [
          "You are JARVIS, an AI assistant that speaks out loud.",
          `The local date and time right now is ${spokenNow(input.now ?? new Date())}.`,
          "Search the web, then answer in two to four plain spoken sentences with the key facts.",
          "No markdown, lists, links, or citation marks.",
        ].join(" "),
      },
      ...input.history,
      { role: "user", content: input.question },
    ],
    temperature: 0.3,
    max_completion_tokens: 2000,
    // Groq recommends low effort with browser search; higher effort browses longer and costs more tokens.
    reasoning_effort: "low",
    include_reasoning: false,
    tools: [{ type: "browser_search" }],
    tool_choice: "required",
  };
  const response = await apiFetch(
    `${GROQ_API_ROOT}/chat/completions`,
    input.apiKey,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: input.signal,
    },
    input.fetchImpl,
  );
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new GroqError("Groq request failed (bad response)");
  }
  const content = (payload as ChatPayload | undefined)?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new GroqError("Groq request failed (bad response)");
  return spokenText(content);
}

function openTileTool(tileIds: readonly string[]): Record<string, unknown> {
  return {
    type: "function",
    function: {
      name: "open_tile",
      description: "Open one launcher tile. tile_id must be one of the listed ids.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          tile_id: { type: "string", enum: tileIds },
        },
        required: ["tile_id"],
      },
    },
  };
}

export async function transcribeWav(
  input: GroqRequest & { model: string; wav: Uint8Array; language?: string },
): Promise<string> {
  const form = new FormData();
  form.append("model", input.model);
  form.append("language", input.language ?? "en");
  form.append("response_format", "json");
  form.append("temperature", "0");
  form.append("file", new Blob([input.wav.slice()], { type: "audio/wav" }), "utterance.wav");
  const response = await apiFetch(
    `${GROQ_API_ROOT}/audio/transcriptions`,
    input.apiKey,
    { method: "POST", body: form, signal: input.signal },
    input.fetchImpl,
  );
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new GroqError("Groq request failed (bad response)");
  }
  const text = payload && typeof payload === "object" ? (payload as { text?: unknown }).text : undefined;
  if (typeof text !== "string") throw new GroqError("Groq request failed (bad response)");
  return text.trim();
}

export interface SpeechAudio {
  bytes: Uint8Array;
  contentType: string;
}
