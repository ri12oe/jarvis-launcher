import { randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import type { AskResult } from "./voice-session";

/**
 * The `jarvis` terminal command talks to the running app over a named pipe.
 * Each start writes a fresh random token next to config.json; the command
 * reads it, so only your own Windows account can make requests. One JSON
 * line in, one JSON line out:
 *
 *   {"token":"...","text":"open figma","speak":false}
 *   {"ok":true,"lines":["Opening Figma."]}
 *
 *   {"token":"...","ping":true}
 *   {"ok":true,"lines":[],"pong":true}
 */

export const CLI_INFO_FILE = "cli.json";
const MAX_REQUEST_BYTES = 8 * 1024;
const REQUEST_TIMEOUT_MS = 150_000;

export function pipeName(user = os.userInfo().username): string {
  const safe = user.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 64) || "user";
  return `\\\\.\\pipe\\jarvis-launcher-${safe}`;
}

export interface CliRequest {
  token?: unknown;
  text?: unknown;
  speak?: unknown;
  ping?: unknown;
}

export function tokensMatch(expected: string, given: unknown): boolean {
  if (typeof given !== "string") return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Handle one request line. Pure apart from `ask`, so it can be tested. */
export async function handleCliLine(
  line: string,
  token: string,
  ask: (text: string, speak: boolean) => Promise<AskResult>,
): Promise<AskResult & { pong?: boolean }> {
  let request: CliRequest;
  try {
    request = JSON.parse(line) as CliRequest;
  } catch {
    return { ok: false, lines: [], error: "Bad request" };
  }
  if (
    !request ||
    typeof request !== "object" ||
    !tokensMatch(token, request.token)
  ) {
    return { ok: false, lines: [], error: "Not allowed" };
  }
  if (request.ping === true) return { ok: true, lines: [], pong: true };
  if (typeof request.text !== "string" || !request.text.trim()) {
    return { ok: false, lines: [], error: "Nothing to ask" };
  }
  return ask(request.text, request.speak === true);
}

export class CliPipe {
  private server: net.Server | null = null;
  private busy = false;
  private readonly token = randomBytes(24).toString("hex");

  constructor(
    private readonly userData: string,
    private readonly ask: (text: string, speak: boolean) => Promise<AskResult>,
  ) {}

  start(): void {
    if (process.platform !== "win32" || this.server) return;
    const name = pipeName();
    const server = net.createServer((socket) => this.serve(socket));
    server.on("error", () => {
      // Another Jarvis owns the pipe, or pipes are unavailable. The HUD works without it.
      this.server = null;
    });
    server.listen(name, () => {
      try {
        fs.writeFileSync(
          path.join(this.userData, CLI_INFO_FILE),
          JSON.stringify({ pipe: name, token: this.token, pid: process.pid }),
        );
      } catch {
        // Without the file the command cannot connect; nothing else depends on it.
      }
    });
    this.server = server;
  }

  stop(): void {
    this.server?.close();
    this.server = null;
    try {
      fs.rmSync(path.join(this.userData, CLI_INFO_FILE), { force: true });
    } catch {
      // Already gone.
    }
  }

  private serve(socket: net.Socket): void {
    let buffer = "";
    let handled = false;
    const reply = (result: unknown) => {
      if (socket.destroyed) return;
      socket.end(`${JSON.stringify(result)}\n`);
    };
    socket.setEncoding("utf8");
    socket.setTimeout(REQUEST_TIMEOUT_MS, () => socket.destroy());
    socket.on("error", () => socket.destroy());
    socket.on("data", (chunk: string) => {
      if (handled) return;
      buffer += chunk;
      if (buffer.length > MAX_REQUEST_BYTES) {
        handled = true;
        reply({ ok: false, lines: [], error: "Request too long" });
        return;
      }
      const newline = buffer.indexOf("\n");
      if (newline < 0) return;
      handled = true;
      const line = buffer.slice(0, newline);
      if (this.busy && !line.includes('"ping"')) {
        reply({
          ok: false,
          lines: [],
          error: "Jarvis is busy with another request",
        });
        return;
      }
      const isPing = line.includes('"ping"');
      if (!isPing) this.busy = true;
      handleCliLine(line, this.token, this.ask)
        .then(reply)
        .catch(() => reply({ ok: false, lines: [], error: "Request failed" }))
        .finally(() => {
          if (!isPing) this.busy = false;
        });
    });
  }
}
