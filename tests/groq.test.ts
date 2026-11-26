import { afterEach, describe, expect, it, vi } from "vitest";
import {
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
    ).toEqual({ text: "Opening Edge.", tileId: "edge" });

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
    ).toEqual({ text: "I can't open that.", tileId: undefined });

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

    expect(result).toEqual({ text: "The reactor is nominal.", tileId: undefined });
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

  it("keeps a short session history", () => {
    let history = appendChatHistory([], "one", "two");
    history = appendChatHistory(history, "three", "four");
    history = appendChatHistory(history, "five", "six");
    history = appendChatHistory(history, "seven", "eight");
    history = appendChatHistory(history, "nine", "ten");
    expect(history).toHaveLength(8);
    expect(history[0]?.content).toBe("three");
    expect(history.at(-1)?.content).toBe("ten");
  });
});
