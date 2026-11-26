import { afterEach, describe, expect, it, vi } from "vitest";
import {
  describePc,
  readPcControl,
  searchAnswer,
  spokenText,
  GROQ_API_ROOT,
  GroqError,
  appendChatHistory,
  completeChat,
  jarvisSystemPrompt,
  parseChatCompletion,
  redactSecret,
  transcribeWav,
} from "../src/shared/groq";

const KEY = "gsk_test-key-should-not-leak";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function spyConsole(): string[] {
  const calls: string[] = [];
  for (const method of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      calls.push(args.map((arg) => String(arg)).join(" "));
    });
  }
  return calls;
}

describe("Groq client", () => {
  it("parses a chat completion and drops an unknown tile id", () => {
    expect(
      parseChatCompletion(
        {
          choices: [
            {
              message: {
                content: "Opening Edge.",
                tool_calls: [{ function: { name: "open_tile", arguments: '{"tile_id":"edge"}' } }],
              },
            },
          ],
        },
        ["edge", "explorer"],
      ),
    ).toMatchObject({ text: "Opening Edge.", tileId: "edge", pc: [], search: undefined });

    expect(
      parseChatCompletion(
        {
          choices: [
            {
              message: {
                content: "I can't open that.",
                tool_calls: [{ function: { name: "open_tile", arguments: '{"tile_id":"secrets"}' } }],
              },
            },
          ],
        },
        ["edge"],
      ),
    ).toMatchObject({ text: "I can't open that.", tileId: undefined, pc: [], search: undefined });

    expect(
      parseChatCompletion(
        {
          choices: [
            { message: { content: "No.", tool_calls: [{ function: { name: "open_tile", arguments: "{" } }] } },
          ],
        },
        ["edge"],
      ).tileId,
    ).toBeUndefined();
  });

  it("posts chat completions with only the allowed tile ids and never logs the key", async () => {
    const logs = spyConsole();
    const seen: { url: string; body: string; authorization: string }[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const headers = new Headers(init?.headers);
      seen.push({
        url: String(input),
        body: typeof init?.body === "string" ? init.body : "",
        authorization: headers.get("Authorization") ?? "",
      });
      return new Response(
        JSON.stringify({
          choices: [{ message: { role: "assistant", content: "The reactor is nominal." } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    const result = await completeChat({
      apiKey: KEY,
      model: "openai/gpt-oss-20b",
      messages: [
        { role: "system", content: jarvisSystemPrompt([{ id: "edge", label: "Microsoft Edge" }]) },
        { role: "user", content: "hello" },
      ],
      tileIds: ["edge", "edge"],
      fetchImpl,
    });

    expect(result).toEqual({ text: "The reactor is nominal.", calls: [], computer: [], tileId: undefined, pc: [], search: undefined });
    expect(seen[0]?.url).toBe(`${GROQ_API_ROOT}/chat/completions`);
    expect(seen[0]?.authorization).toBe(`Bearer ${KEY}`);
    const body = JSON.parse(seen[0]?.body ?? "{}") as {
      model: string;
      tools: Array<{ function: { parameters: { properties: { tile_id: { enum: string[] } } } } }>;
    };
    expect(body.model).toBe("openai/gpt-oss-20b");
    expect((body as unknown as { include_reasoning: boolean }).include_reasoning).toBe(false);
    expect(body.tools[0]?.function.parameters.properties.tile_id.enum).toEqual(["edge"]);
    expect(seen[0]?.url.includes(KEY)).toBe(false);
    expect(seen[0]?.body.includes(KEY)).toBe(false);
    expect(logs.join("\n").includes(KEY)).toBe(false);
    expect(jarvisSystemPrompt([{ id: "edge", label: "Microsoft Edge" }])).toContain("edge (Microsoft Edge)");
  });

  it("redacts the key from a failed response and does not log it", async () => {
    const logs = spyConsole();
    const fetchImpl: typeof fetch = async () =>
      new Response(`denied ${KEY}`, { status: 401, headers: { "content-type": "text/plain" } });
    const error = await completeChat({
      apiKey: KEY,
      model: "openai/gpt-oss-20b",
      messages: [{ role: "user", content: "hello" }],
      tileIds: [],
      fetchImpl,
    }).then(
      () => undefined,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(GroqError);
    expect(error instanceof Error ? error.message : "").toBe("Groq request failed (401)");
    expect(error instanceof Error ? error.message.includes(KEY) : false).toBe(false);
    expect(logs.join("\n").includes(KEY)).toBe(false);
    expect(redactSecret(`bearer ${KEY}`, KEY)).toBe("bearer [redacted]");
  });

  it("does not pass through a network error that contains the key", async () => {
    const logs = spyConsole();
    const fetchImpl: typeof fetch = async () => {
      throw new Error(`socket ${KEY}`);
    };
    await expect(
      transcribeWav({ apiKey: KEY, model: "whisper-large-v3-turbo", wav: Uint8Array.from([1]), fetchImpl }),
    ).rejects.toThrow("Groq request failed (network)");
    expect(logs.join("\n").includes(KEY)).toBe(false);
  });

  it("sends the utterance to Groq speech-to-text", async () => {
    const fetchImpl: typeof fetch = async (input, init) => {
      expect(String(input)).toBe(`${GROQ_API_ROOT}/audio/transcriptions`);
      const form = init?.body as FormData;
      expect(form).toBeInstanceOf(FormData);
      expect(form.get("model")).toBe("whisper-large-v3-turbo");
      expect(form.get("response_format")).toBe("json");
      expect([...form.keys()].at(-1)).toBe("file");
      expect(new Headers(init?.headers).get("Authorization")).toBe(`Bearer ${KEY}`);
      return new Response(JSON.stringify({ text: " open edge " }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    await expect(
      transcribeWav({ apiKey: KEY, model: "whisper-large-v3-turbo", wav: Uint8Array.from([1, 2]), fetchImpl }),
    ).resolves.toBe("open edge");
  });

  it("tells the model the local date and time, since it has no clock", () => {
    const now = new Date(2026, 10, 26, 13, 41);
    const prompt = jarvisSystemPrompt([], now);
    expect(prompt).toContain("Thursday, November 26, 2026");
    expect(prompt).toContain("1:41");
  });

  it("reads PC controls, refuses power actions, and asks for web searches", () => {
    const payload = {
      choices: [
        {
          message: {
            content: "",
            tool_calls: [
              { function: { name: "pc_control", arguments: JSON.stringify({ action: "volume_set", value: 140 }) } },
              { function: { name: "pc_control", arguments: JSON.stringify({ action: "shutdown" }) } },
              { function: { name: "pc_control", arguments: JSON.stringify({ action: "media_next" }) } },
              { function: { name: "web_search", arguments: JSON.stringify({ query: " weather in Indianapolis " }) } },
            ],
          },
        },
      ],
    };
    const result = parseChatCompletion(payload, []);
    expect(result.pc).toEqual([
      { action: "volume-set", value: 100 },
      { action: "media-next", value: 0 },
    ]);
    expect(result.search).toBe("weather in Indianapolis");
    expect(readPcControl("volume_change", "-10")).toEqual({ action: "volume-step", value: -10 });
    expect(readPcControl("brightness_set", undefined)).toBeUndefined();
    expect(readPcControl("sleep", 0)).toBeUndefined();
    expect(describePc(result.pc)).toBe("Volume at 100 percent.");
  });

  it("asks Groq's browser search and turns the answer into speech", async () => {
    let sent: Record<string, unknown> = {};
    const fetchImpl: typeof fetch = async (_input, init) => {
      sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "**Sunny** and 45 degrees today【1†L2-L4】. See https://example.com" } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };
    const answer = await searchAnswer({
      apiKey: KEY,
      model: "openai/gpt-oss-120b",
      question: "weather?",
      history: [],
      fetchImpl,
    });
    expect(answer).toBe("Sunny and 45 degrees today. See");
    expect(sent.tools).toEqual([{ type: "browser_search" }]);
    expect(sent.reasoning_effort).toBe("low");
    expect(spokenText("x".repeat(10) + ". Final answer here.", 20)).toBe("Final answer here.");
  });

  it("keeps computer-control calls with their ids, and refuses bad arguments", () => {
    const result = parseChatCompletion(
      {
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: "call_a",
                  function: { name: "write_code", arguments: JSON.stringify({ filename: "hello.py", code: 'print("hi")' }) },
                },
                { id: "call_b", function: { name: "write_code", arguments: JSON.stringify({ filename: "../x.py", code: "x" }) } },
                { id: "call_c", function: { name: "press_keys", arguments: JSON.stringify({ keys: "alt+f4" }) } },
              ],
            },
          },
        ],
      },
      [],
    );
    expect(result.calls.map((call) => call.id)).toEqual(["call_a", "call_b", "call_c"]);
    expect(result.computer[0]?.call).toEqual({ tool: "write_code", filename: "hello.py", code: 'print("hi")' });
    expect(result.computer[1]?.call).toBeUndefined();
    expect(result.computer[2]?.call).toBeUndefined();
    expect(jarvisSystemPrompt([], new Date(), true)).toContain("never send emails");
    expect(jarvisSystemPrompt([], new Date(), false)).not.toContain("write_code");
  });

  it("keeps the last ten exchanges", () => {
    let history = appendChatHistory([], "q0", "a0");
    for (let i = 1; i < 12; i++) history = appendChatHistory(history, `q${i}`, `a${i}`);
    expect(history).toHaveLength(20);
    expect(history[0]?.content).toBe("q2");
    expect(history.at(-1)?.content).toBe("a11");
  });
});
