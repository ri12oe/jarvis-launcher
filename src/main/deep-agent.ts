import path from "node:path";
import {
  cmdQuote,
  deepArgs,
  deepPrompt,
  deepSettings,
  finalReport,
  parseStreamLine,
  projectSlug,
  safeOpenTarget,
  type DeepCall,
  type DeepConfig,
  type OpenTarget,
} from "../shared/deep";

/** The bits of a child process the agent uses, so tests can pass a fake. */
export interface DeepProcess {
  pid?: number;
  stdin: { end(text: string): void } | null;
  stdout: { on(event: "data", listener: (chunk: Buffer | string) => void): unknown } | null;
  stderr: { on(event: "data", listener: (chunk: Buffer | string) => void): unknown } | null;
  on(event: "close", listener: (code: number | null) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  kill(): boolean;
}

export interface DeepHost {
  config(): DeepConfig;
  workspace(): string;
  /** claude.exe or claude.cmd, or undefined when Claude Code isn't installed. */
  findClaude(): string | undefined;
  spawn(file: string, args: readonly string[], cwd: string, shell: boolean): DeepProcess;
  /** Stops the run and anything it started. */
  killTree(pid: number): void;
  exists(file: string): boolean;
  mkdir(dir: string): void;
  readFile(file: string): string | undefined;
  writeFile(file: string, text: string): void;
  appendFile(file: string, text: string): void;
  listDirs(dir: string): { name: string; mtimeMs: number }[];
  /** Show a result. Websites are served from projectDir by the local preview server. */
  open(target: OpenTarget, projectDir: string): Promise<void>;
  /** The HUD line changed. */
  changed(): void;
  /** Say this out loud when Jarvis is free. */
  announce(line: string): void;
  now(): Date;
}

interface Run {
  project: string;
  dir: string;
  process: DeepProcess;
  started: number;
  step: string;
  steps: number;
  timer: ReturnType<typeof setTimeout>;
  cancelled: boolean;
  timedOut: boolean;
}

const STATE_DIR = ".jarvis";

/**
 * One Claude Code run at a time, in <workspace>\<project>. Each project keeps
 * its Claude Code session id, so "change the colors on my portfolio" picks up
 * where the last run on that project stopped.
 */
export class DeepAgent {
  private run: Run | undefined;
  private last = "";

  constructor(private readonly host: DeepHost) {}

  status(): string {
    if (!this.run) return "";
    const minutes = Math.floor((Date.now() - this.run.started) / 60000);
    const time = minutes > 0 ? ` · ${minutes}m` : "";
    return `DEEP THINK · ${this.run.project}${time} · ${this.run.step}`;
  }

  running(): boolean {
    return this.run !== undefined;
  }

  /** The tool result the fast model sees. */
  async handle(call: DeepCall): Promise<string> {
    if (call.action === "status") return this.describe();
    if (call.action === "cancel") return this.cancel();
    if (call.action === "open") return this.reopen(call.project);
    return this.start(call.project, call.task);
  }

  cancel(): string {
    const run = this.run;
    if (!run) return "OK: deep think isn't running.";
    run.cancelled = true;
    this.stop(run);
    return `OK: stopped deep think on ${run.project}. Files it already made are still in its folder.`;
  }

  /** "Open my portfolio site": show what deep think last made for that project. */
  private async reopen(projectName: string): Promise<string> {
    const slug = projectSlug(projectName);
    const workspace = this.host.workspace();
    let project = slug;
    if (!this.host.exists(path.join(workspace, project))) {
      // "portfolio" finds "portfolio-site".
      const match = this.recentProjects(50).find((name) => name.includes(slug) || slug.includes(name));
      if (!match) return `Failed: there's no deep think project called ${projectName}. Recent projects: ${this.recentProjects().join(", ") || "none"}.`;
      project = match;
    }
    const dir = path.join(workspace, project);
    const saved = readSession(this.host.readFile(path.join(dir, STATE_DIR, "session.json")));
    const guess = ["index.html", path.join("dist", "index.html"), path.join("build", "index.html"), "PLAN.md", "README.md"].find((file) =>
      this.host.exists(path.join(dir, file)),
    );
    const target = safeOpenTarget(saved.open ?? guess, dir, path) ?? { kind: "file" as const, path: dir };
    try {
      await this.host.open(target, dir);
    } catch (caught) {
      return `Failed: couldn't open ${project} (${caught instanceof Error ? caught.message : "error"}).`;
    }
    return `OK: opened ${project}${target.kind === "url" ? " in Figma" : ""}.`;
  }

  private describe(): string {
    const recent = this.recentProjects();
    const list = recent.length > 0 ? ` Recent projects: ${recent.join(", ")}.` : "";
    if (this.run) {
      const minutes = Math.max(1, Math.round((Date.now() - this.run.started) / 60000));
      return `OK: deep think has worked on ${this.run.project} for about ${minutes} minute${minutes === 1 ? "" : "s"}, ${this.run.steps} steps so far, now ${this.run.step}.${list}`;
    }
    return `OK: deep think is idle.${this.last ? ` Last run: ${this.last}` : ""}${list}`;
  }

  private recentProjects(limit = 5): string[] {
    try {
      return this.host
        .listDirs(this.host.workspace())
        .filter((dir) => !dir.name.startsWith("."))
        .sort((a, b) => b.mtimeMs - a.mtimeMs)
        .slice(0, limit)
        .map((dir) => dir.name);
    } catch {
      return [];
    }
  }

  private start(projectName: string, task: string): string {
    const config = this.host.config();
    if (!config.enabled) return 'Refused: deep think is turned off ("deep": { "enabled": false } in config.json).';
    if (this.run) {
      return `Refused: deep think is still working on ${this.run.project}. Tell the user to wait, or offer to cancel it.`;
    }
    const claude = this.host.findClaude();
    if (!claude) {
      return "Failed: Claude Code isn't installed on this PC. Tell the user to install it from claude.com/product/claude-code, then run claude once in a terminal to sign in.";
    }
    const project = projectSlug(projectName);
    const dir = path.join(this.host.workspace(), project);
    const stateDir = path.join(dir, STATE_DIR);
    let resumeId: string | undefined;
    try {
      this.host.mkdir(stateDir);
      this.host.mkdir(path.join(dir, ".claude"));
      const settingsFile = path.join(dir, ".claude", "settings.local.json");
      this.host.writeFile(settingsFile, `${JSON.stringify(deepSettings(), null, 2)}\n`);
      resumeId = readSession(this.host.readFile(path.join(stateDir, "session.json"))).sessionId;
    } catch (caught) {
      return `Failed: couldn't set up the project folder (${caught instanceof Error ? caught.message : "error"}).`;
    }

    const prompt = deepPrompt({
      task,
      project,
      dir,
      now: this.host.now().toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" }),
      followUp: resumeId !== undefined,
    });
    const args = deepArgs(config, resumeId);
    const shell = /\.(cmd|bat)$/i.test(claude);
    const file = shell ? cmdQuote(claude) : claude;
    let child: DeepProcess;
    try {
      child = this.host.spawn(file, shell ? args.map(cmdQuote) : args, dir, shell);
    } catch (caught) {
      return `Failed: couldn't start Claude Code (${caught instanceof Error ? caught.message : "error"}).`;
    }

    const log = path.join(stateDir, "last-run.jsonl");
    try {
      this.host.writeFile(log, "");
    } catch {
      // The log is only for troubleshooting.
    }
    const run: Run = {
      project,
      dir,
      process: child,
      started: Date.now(),
      step: "starting",
      steps: 0,
      cancelled: false,
      timedOut: false,
      timer: setTimeout(() => {
        run.timedOut = true;
        this.stop(run);
      }, config.maxMinutes * 60000),
    };
    this.run = run;
    this.host.changed();

    let buffer = "";
    let resultText = "";
    let ok = false;
    let gotResult = false;
    let sessionId = resumeId;
    let figma: "connected" | "missing" | "unavailable" | undefined;
    let denials = 0;
    let stderr = "";

    const onLine = (line: string) => {
      if (!line.trim()) return;
      try {
        this.host.appendFile(log, `${line}\n`);
      } catch {
        // Keep going without the log.
      }
      for (const event of parseStreamLine(line)) {
        if (event.kind === "init") {
          if (event.sessionId) sessionId = event.sessionId;
          figma = event.figma;
          run.step = "reading the request";
        } else if (event.kind === "step") {
          run.steps += 1;
          run.step = event.text;
        } else {
          gotResult = true;
          ok = event.ok;
          resultText = event.text;
          denials = event.denials;
          if (event.sessionId) sessionId = event.sessionId;
        }
      }
      if (this.run === run) this.host.changed();
    };

    child.stdout?.on("data", (chunk) => {
      buffer += chunk.toString();
      let index = buffer.indexOf("\n");
      while (index >= 0) {
        onLine(buffer.slice(0, index));
        buffer = buffer.slice(index + 1);
        index = buffer.indexOf("\n");
      }
    });
    child.stderr?.on("data", (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-2000);
    });

    let finished = false;
    const finish = (spawnError?: Error) => {
      if (finished) return;
      finished = true;
      if (buffer.trim()) onLine(buffer);
      clearTimeout(run.timer);
      if (this.run === run) this.run = undefined;
      this.host.changed();
      void this.report({ run, ok: ok && gotResult, resultText, spawnError, stderr, figma, denials, sessionId });
    };
    child.on("error", (error) => finish(error));
    child.on("close", () => finish());
    try {
      child.stdin?.end(prompt);
    } catch {
      // A failed spawn reports through "error".
    }
    return `OK: deep think started on "${project}" in ${dir}. It works in the background, usually a few minutes; Jarvis will announce when it's done.`;
  }

  private async report(input: {
    run: Run;
    ok: boolean;
    resultText: string;
    spawnError?: Error;
    stderr: string;
    figma?: string;
    denials: number;
    sessionId?: string;
  }): Promise<void> {
    const { run } = input;
    const sessionFile = path.join(run.dir, STATE_DIR, "session.json");
    const previous = readSession(this.host.readFile(sessionFile));
    const save = (open: string | undefined) => {
      const sessionId = input.sessionId ?? previous.sessionId;
      if (!sessionId && !open) return;
      try {
        this.host.writeFile(sessionFile, JSON.stringify({ sessionId, open }));
      } catch {
        // The next run starts a fresh session.
      }
    };
    const name = run.project.replace(/-/g, " ");
    if (run.cancelled || run.timedOut || input.spawnError || !input.ok) save(previous.open);
    if (run.cancelled) {
      this.last = `${run.project} was cancelled.`;
      return;
    }
    if (run.timedOut) {
      this.last = `${run.project} ran out of time.`;
      this.host.announce(`Deep think ran out of time on ${name}. What it finished is in the project folder.`);
      return;
    }
    if (input.spawnError || !input.ok) {
      const reason = deepFailure(input.resultText, input.stderr, input.spawnError);
      this.last = `${run.project} failed: ${reason}`;
      this.host.announce(`Deep think hit a problem on ${name}: ${reason}`);
      return;
    }
    const report = finalReport(input.resultText);
    const target = safeOpenTarget(report.open, run.dir, path);
    save(target ? report.open : previous.open);
    let line = report.spoken || `Deep think finished ${name}.`;
    if (input.figma === "missing" && /figma/i.test(input.resultText) && !/figma\.com/i.test(report.open ?? "")) {
      line += " To let it design in Figma, connect Figma to Claude Code once; the steps are in the README.";
    }
    if (input.denials > 0) line += " It skipped a step that needed your permission; check the summary in the folder.";
    try {
      this.host.writeFile(path.join(run.dir, STATE_DIR, "summary.md"), `${input.resultText.trim()}\n`);
    } catch {
      // Summary file is optional.
    }
    this.last = `${run.project} finished. ${report.spoken}`.trim();
    if (this.host.config().openResult) {
      await this.host.open(target ?? { kind: "file", path: run.dir }, run.dir).catch(() => undefined);
    }
    this.host.announce(line);
  }

  private stop(run: Run): void {
    clearTimeout(run.timer);
    if (run.process.pid) {
      try {
        this.host.killTree(run.process.pid);
        return;
      } catch {
        // Fall back to killing just the process.
      }
    }
    try {
      run.process.kill();
    } catch {
      // Already gone.
    }
  }
}

function readSession(text: string | undefined): { sessionId?: string; open?: string } {
  if (!text) return {};
  try {
    const parsed = JSON.parse(text) as { sessionId?: unknown; open?: unknown };
    return {
      sessionId: typeof parsed.sessionId === "string" ? parsed.sessionId : undefined,
      open: typeof parsed.open === "string" ? parsed.open : undefined,
    };
  } catch {
    return {};
  }
}

/** A short, speakable reason a run failed. */
export function deepFailure(result: string, stderr: string, spawnError?: Error): string {
  const text = `${result}\n${stderr}\n${spawnError?.message ?? ""}`;
  if (/ENOENT|not recognized|cannot find/i.test(text)) return "Claude Code couldn't be started.";
  if (/log ?in|login|authenticat|unauthori[sz]ed|401|oauth/i.test(text)) {
    return "Claude Code isn't signed in. Run claude in a terminal once and sign in.";
  }
  if (/rate.?limit|usage limit|429|overloaded/i.test(text)) return "Claude's usage limit was reached. Try again later.";
  if (/unknown option|unknown argument|error: option/i.test(text)) {
    return "this Claude Code version is too old. Run claude update in a terminal.";
  }
  const first = result.replace(/\s+/g, " ").trim().slice(0, 120);
  return first ? `${first}` : "it stopped without a result.";
}
