import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { windowsPowershellPath } from "../discovery/start-apps";
import type { SpeechAudio } from "../shared/groq";

/**
 * Speaks a reply with the voice built into Windows (System.Speech), so text to
 * speech is free, works offline, and has no rate limit. One PowerShell process
 * stays open. Requests are JSON lines `{"id":1,"voice":"david","text":"..."}`
 * on stdin. Replies are JSON lines with the WAV file in base64.
 *
 * The script is collapsed to one line, so every statement ends in a semicolon.
 * Requests are sent as ASCII JSON, so the console encoding does not matter.
 */
const SPEECH_SOURCE = String.raw`
$ErrorActionPreference = 'Stop';
$ProgressPreference = 'SilentlyContinue';
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false;
Add-Type -AssemblyName System.Speech;
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer;
$voices = @($synth.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { $_.VoiceInfo.Name });
$fallback = $synth.Voice.Name;
while ($true) {
  $line = [Console]::In.ReadLine();
  if ($line -eq $null -or $line -eq 'QUIT') { break };
  $req = $null;
  try {
    $req = $line | ConvertFrom-Json;
    $hint = [string]$req.voice;
    $pick = $fallback;
    if ($hint) {
      $match = $voices | Where-Object { $_ -like ('*' + $hint + '*') } | Select-Object -First 1;
      if ($match) { $pick = $match };
    };
    if ($pick -and $synth.Voice.Name -ne $pick) { $synth.SelectVoice($pick) };
    $stream = New-Object System.IO.MemoryStream;
    $synth.SetOutputToWaveStream($stream);
    $synth.Speak([string]$req.text);
    $synth.SetOutputToNull();
    $json = @{ id = $req.id; ok = $true; audio = [Convert]::ToBase64String($stream.ToArray()) } | ConvertTo-Json -Compress;
  } catch {
    $id = $null;
    if ($req -ne $null) { $id = $req.id };
    $json = @{ id = $id; ok = $false; error = [string]$_.Exception.Message } | ConvertTo-Json -Compress;
  };
  [Console]::Out.WriteLine($json);
  [Console]::Out.Flush();
};
`;

/** One line, so it can be passed as a single -Command argument with no shell. */
export function speechHelperScript(): string {
  return SPEECH_SOURCE.replace(/\s+/g, " ").trim();
}

/** JSON with every non-ASCII character escaped, so stdin encoding cannot garble it. */
export function speechRequestLine(
  id: number,
  voice: string,
  text: string,
): string {
  const json = JSON.stringify({ id, voice, text: text.slice(0, 2000) });
  return json.replace(
    /[\u007f-￿]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

/** Reads one reply line. Returns undefined for anything that is not a reply. */
export function parseSpeechReply(
  line: string,
):
  | { id: number; ok: true; audio: Uint8Array }
  | { id: number; ok: false }
  | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(line) as unknown;
  } catch {
    return undefined;
  }
  if (!raw || typeof raw !== "object") return undefined;
  const reply = raw as { id?: unknown; ok?: unknown; audio?: unknown };
  if (typeof reply.id !== "number") return undefined;
  if (
    reply.ok === true &&
    typeof reply.audio === "string" &&
    reply.audio.length > 0
  ) {
    return {
      id: reply.id,
      ok: true,
      audio: new Uint8Array(Buffer.from(reply.audio, "base64")),
    };
  }
  return { id: reply.id, ok: false };
}

const SPEAK_TIMEOUT_MS = 20_000;

export class WindowsSpeech {
  private child: ChildProcessWithoutNullStreams | null = null;
  private buffer = "";
  private nextId = 1;
  private pending = new Map<
    number,
    {
      resolve: (audio: SpeechAudio) => void;
      reject: (error: Error) => void;
      cleanup: () => void;
    }
  >();

  speak(
    text: string,
    voice: string,
    signal?: AbortSignal,
  ): Promise<SpeechAudio> {
    if (process.platform !== "win32")
      return Promise.reject(new Error("Windows speech is only on Windows"));
    if (signal?.aborted) return Promise.reject(new Error("aborted"));
    const child = this.ensure();
    if (!child)
      return Promise.reject(new Error("Windows speech did not start"));
    const id = this.nextId++;
    return new Promise<SpeechAudio>((resolve, reject) => {
      const timer = setTimeout(
        () => this.settle(id, new Error("Windows speech timed out")),
        SPEAK_TIMEOUT_MS,
      );
      const onAbort = () => this.settle(id, new Error("aborted"));
      signal?.addEventListener("abort", onAbort, { once: true });
      this.pending.set(id, {
        resolve,
        reject,
        cleanup: () => {
          clearTimeout(timer);
          signal?.removeEventListener("abort", onAbort);
        },
      });
      child.stdin.write(`${speechRequestLine(id, voice, text)}\n`);
    });
  }

  stop(): void {
    const child = this.child;
    this.child = null;
    if (child) {
      try {
        child.stdin.end("QUIT\n");
      } catch {
        child.kill();
      }
    }
    this.failAll(new Error("Windows speech stopped"));
  }

  private ensure(): ChildProcessWithoutNullStreams | null {
    if (this.child) return this.child;
    try {
      const child = spawn(
        windowsPowershellPath(process.env.SystemRoot),
        [
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          speechHelperScript(),
        ],
        { windowsHide: true, shell: false },
      );
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => this.read(chunk));
      child.stderr.on("data", () => undefined);
      child.on("error", () => this.lost(child));
      child.on("exit", () => this.lost(child));
      this.child = child;
      this.buffer = "";
      return child;
    } catch {
      return null;
    }
  }

  private read(chunk: string): void {
    this.buffer += chunk;
    let newline = this.buffer.indexOf("\n");
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      const reply = line ? parseSpeechReply(line) : undefined;
      if (reply) {
        if (reply.ok)
          this.settle(reply.id, undefined, {
            bytes: reply.audio,
            contentType: "audio/wav",
          });
        else this.settle(reply.id, new Error("Windows speech failed"));
      }
      newline = this.buffer.indexOf("\n");
    }
  }

  private settle(id: number, error?: Error, audio?: SpeechAudio): void {
    const entry = this.pending.get(id);
    if (!entry) return;
    this.pending.delete(id);
    entry.cleanup();
    if (audio) entry.resolve(audio);
    else entry.reject(error ?? new Error("Windows speech failed"));
  }

  private lost(child: ChildProcessWithoutNullStreams): void {
    if (this.child !== child) return;
    this.child = null;
    this.failAll(new Error("Windows speech exited"));
  }

  private failAll(error: Error): void {
    for (const id of [...this.pending.keys()]) this.settle(id, error);
  }
}
