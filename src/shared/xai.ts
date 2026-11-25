import type { VoiceTile } from "./voice-command";

export const XAI_API_ROOT = "https://api.x.ai/v1";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatResult {
  text: string;
  /** Set only when the model called open_tile with an id from the allow list. */
  tileId?: string;
}

export class XaiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XaiError";
  }
}

export function jarvisSystemPrompt(tiles: readonly VoiceTile[]): string {
  const list = tiles.map((tile) => `${tile.id} (${tile.label})`).join(", ");
  return [
    "You are JARVIS, the voice of a personal Windows launcher.",
    "Reply in one or two short spoken sentences. No markdown, no lists, and no emoji.",
    "You can open a tile by calling open_tile. Use only an id from this list:",
    list || "(no tiles)",
    "Do not invent tiles. If the user is only chatting, do not call the tool.",
  ].join(" ");
}

export function appendChatHistory(history: readonly ChatMessage[], user: string, assistant: string): ChatMessage[] {
  const next = history.concat(
    { role: "user", content: clip(user) },
    { role: "assistant", content: clip(assistant) },
  );
  return next.slice(-8);
}

function clip(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > 400 ? `${trimmed.slice(0, 400)}…` : trimmed;
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
  if (!payload || typeof payload !== "object") throw new XaiError("xAI request failed (bad response)");
  const message = (payload as ChatPayload).choices?.[0]?.message;
  if (!message) throw new XaiError("xAI request failed (bad response)");
  const allowed = new Set(allowedIds);
  const tileId = readOpenTile(message.tool_calls, allowed);
  return { text: typeof message.content === "string" ? message.content.trim() : "", tileId };
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

export interface XaiRequest {
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
          throw new XaiError(`xAI request failed (${response.status})`);
        },
        () => {
          throw new XaiError(`xAI request failed (${response.status})`);
        },
      );
    },
    () => {
      throw new XaiError("xAI request failed (network)");
    },
  );
}

export async function completeChat(
  input: XaiRequest & { model: string; messages: readonly ChatMessage[]; tileIds: readonly string[] },
): Promise<ChatResult> {
  const tileIds = [...new Set(input.tileIds.filter((id) => id.length > 0))];
  const body: Record<string, unknown> = {
    model: input.model,
    messages: input.messages,
    temperature: 0.4,
    max_completion_tokens: 160,
  };
  if (tileIds.length > 0) {
    body.tools = [openTileTool(tileIds)];
    body.tool_choice = "auto";
    body.parallel_tool_calls = false;
  }
  const response = await apiFetch(
    `${XAI_API_ROOT}/chat/completions`,
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
    throw new XaiError("xAI request failed (bad response)");
  }
  return parseChatCompletion(payload, tileIds);
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
  input: XaiRequest & { model: string; wav: Uint8Array; language?: string },
): Promise<string> {
  const form = new FormData();
  form.append("model", input.model);
  form.append("language", input.language ?? "en");
  form.append("format", "true");
  form.append("file", new Blob([input.wav.slice()], { type: "audio/wav" }), "utterance.wav");
  const response = await apiFetch(
    `${XAI_API_ROOT}/stt`,
    input.apiKey,
    { method: "POST", body: form, signal: input.signal },
    input.fetchImpl,
  );
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new XaiError("xAI request failed (bad response)");
  }
  const text = payload && typeof payload === "object" ? (payload as { text?: unknown }).text : undefined;
  if (typeof text !== "string") throw new XaiError("xAI request failed (bad response)");
  return text.trim();
}

export interface SpeechAudio {
  bytes: Uint8Array;
  contentType: string;
}

export async function synthesizeSpeech(
  input: XaiRequest & { text: string; voiceId: string; language?: string },
): Promise<SpeechAudio> {
  const response = await apiFetch(
    `${XAI_API_ROOT}/tts`,
    input.apiKey,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: input.text.slice(0, 2000),
        voice_id: input.voiceId,
        language: input.language ?? "en",
        output_format: { codec: "mp3", sample_rate: 24000, bit_rate: 128000 },
      }),
      signal: input.signal,
    },
    input.fetchImpl,
  );
  return readSpeech(response);
}

async function readSpeech(response: Response): Promise<SpeechAudio> {
  const type = response.headers.get("content-type") ?? "";
  if (type.includes("json")) {
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new XaiError("xAI request failed (bad response)");
    }
    const record = payload && typeof payload === "object" ? (payload as { audio?: unknown; content_type?: unknown }) : {};
    if (typeof record.audio !== "string" || record.audio.length === 0) {
      throw new XaiError("xAI request failed (empty audio)");
    }
    const bytes = decodeBase64(record.audio);
    const contentType = typeof record.content_type === "string" ? record.content_type : "audio/mpeg";
    return { bytes, contentType };
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length === 0) throw new XaiError("xAI request failed (empty audio)");
  const contentType = type.startsWith("audio/") ? type.split(";")[0].trim() : "audio/mpeg";
  return { bytes, contentType };
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
