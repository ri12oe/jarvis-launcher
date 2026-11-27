import path from "node:path";
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
  cmdQuote,
  deepArgs,
  deepPrompt,
  deepSettings,
  DEFAULT_DEEP,
  finalReport,
  parseDeepCall,
  parseStreamLine,
  projectSlug,
  readDeepConfig,
  safeOpenTarget,
  stepLabel,
} from "../src/shared/deep";
import { parseComputerCall, planLine } from "../src/shared/computer";
import { jarvisSystemPrompt } from "../src/shared/groq";
import { DeepAgent, deepFailure, type DeepHost, type DeepProcess } from "../src/main/deep-agent";

describe("deep think helpers", () => {
  it("makes safe folder names", () => {
    expect(projectSlug("My Portfolio Site!")).toBe("my-portfolio-site");
    expect(projectSlug("../../Windows")).toBe("windows");
    expect(projectSlug("Café ☕ app")).toBe("cafe-app");
    expect(projectSlug("   ")).toBe("project");
    expect(projectSlug("a".repeat(80))).toHaveLength(40);
  });

  it("parses the tool call", () => {
    expect(parseDeepCall({ action: "start", project: "site", task: "build it" })).toEqual({
      tool: "deep_task",
      action: "start",
      project: "site",
      task: "build it",
    });
    expect(parseDeepCall({ action: "start", project: "", task: "x" })).toBeUndefined();
    expect(parseDeepCall({ action: "delete", project: "a", task: "b" })).toBeUndefined();
    expect(parseDeepCall({ action: "status", project: "", task: "" })?.action).toBe("status");
    expect(parseComputerCall("deep_task", { action: "cancel", project: "", task: "" })).toMatchObject({ tool: "deep_task" });
    expect(planLine([{ tool: "deep_task", action: "start", project: "portfolio-site", task: "x" }])).toBe(
      "Deep think is on portfolio site. I'll tell you when it's done.",
    );
  });

  it("only offers deep think when it is on", () => {
    expect(jarvisSystemPrompt([], new Date(), true, true)).toContain("deep_task");
    expect(jarvisSystemPrompt([], new Date(), true, false)).not.toContain("deep_task");
  });

  it("allows build commands and blocks pushing and deploying", () => {
    const settings = deepSettings() as { permissions: { allow: string[]; deny: string[] } };
    expect(settings.permissions.allow).toContain("Bash(npm *)");
    expect(settings.permissions.allow).toContain("mcp__figma");
    expect(settings.permissions.deny).toContain("Bash(git push*)");
    expect(settings.permissions.allow).toContain("PowerShell(npm *)");
    expect(settings.permissions.deny).toContain("PowerShell(git push*)");
    expect(settings.permissions.deny).toContain("PowerShell(Invoke-WebRequest*)");
    expect(settings.permissions.allow.some((rule) => /^(Bash|PowerShell)(\(\*\))?$/.test(rule))).toBe(false);
  });

  it("builds plain arguments and resumes a saved session", () => {
    expect(deepArgs(DEFAULT_DEEP)).toEqual(["-p", "--output-format", "stream-json", "--verbose", "--permission-mode", "acceptEdits"]);
    const args = deepArgs({ ...DEFAULT_DEEP, model: "opus" }, "0b6f2a1c-1111-2222-3333-444455556666");
    expect(args).toContain("--resume");
    expect(args.slice(-2)).toEqual(["--model", "opus"]);
    expect(deepArgs({ ...DEFAULT_DEEP, model: "opus && calc" }, "bad id; rm")).not.toContain("--resume");
    expect(deepArgs({ ...DEFAULT_DEEP, model: "opus && calc" })).not.toContain("--model");
    expect(cmdQuote("C:\\Users\\Mario Rio\\AppData\\Roaming\\npm\\claude.cmd")).toBe(
      '"C:\\Users\\Mario Rio\\AppData\\Roaming\\npm\\claude.cmd"',
    );
    expect(cmdQuote("stream-json")).toBe("stream-json");
  });

  it("puts the request and the reply format in the prompt", () => {
    const prompt = deepPrompt({ task: "A dark portfolio site", project: "portfolio", dir: "C:\\b\\portfolio", now: "today", followUp: false });
    expect(prompt).toContain("A dark portfolio site");
    expect(prompt).toContain("SPOKEN:");
    expect(prompt).toContain("OPEN:");
    expect(prompt).toContain("Never start a dev server");
    expect(deepPrompt({ task: "x", project: "p", dir: "d", now: "n", followUp: true })).toContain("change");
  });

  it("reads the stream", () => {
    expect(
      parseStreamLine(
        JSON.stringify({ type: "system", subtype: "init", session_id: "abc", mcp_servers: [{ name: "figma", status: "connected" }] }),
      ),
    ).toEqual([{ kind: "init", sessionId: "abc", figma: "connected" }]);
    expect(parseStreamLine(JSON.stringify({ type: "system", subtype: "init", session_id: "abc", mcp_servers: [] }))[0]).toMatchObject({
      figma: "missing",
    });
    expect(
      parseStreamLine(
        JSON.stringify({
          type: "assistant",
          parent_tool_use_id: null,
          message: { content: [{ type: "text", text: "hi" }, { type: "tool_use", name: "Write", input: { file_path: "C:\\b\\site\\index.html" } }] },
        }),
      ),
    ).toEqual([{ kind: "step", text: "writing index.html" }]);
    expect(
      parseStreamLine(JSON.stringify({ type: "assistant", parent_tool_use_id: "t1", message: { content: [{ type: "tool_use", name: "Write", input: {} }] } })),
    ).toEqual([]);
    expect(
      parseStreamLine(JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "done", session_id: "abc", total_cost_usd: 0.5, permission_denials: [{}] })),
    ).toEqual([{ kind: "result", ok: true, text: "done", sessionId: "abc", cost: 0.5, denials: 1 }]);
    expect(parseStreamLine("not json")).toEqual([]);
    expect(stepLabel("Bash", { command: "npm run build -- --mode production" })).toBe("running npm run build");
    expect(stepLabel("mcp__figma__use_figma", {})).toBe("designing in Figma");
  });

  it("reads the final report", () => {
    const report = finalReport("Built it.\n\n**SPOKEN:** Your portfolio is ready with three pages.\nOPEN: `index.html`");
    expect(report).toEqual({ spoken: "Your portfolio is ready with three pages.", open: "index.html", summary: "Built it." });
    expect(finalReport("I made a study plan for chemistry. It covers four weeks.\nOPEN: NONE")).toMatchObject({
      spoken: "I made a study plan for chemistry.",
      open: undefined,
    });
  });

  it("opens only project files, Figma links, and local previews", () => {
    const dir = "C:\\Users\\maesp\\FA26\\jarvis-builds\\site";
    const win = path.win32;
    expect(safeOpenTarget("index.html", dir, win)).toEqual({ kind: "file", path: `${dir}\\index.html` });
    expect(safeOpenTarget("dist/index.html", dir, win)).toEqual({ kind: "file", path: `${dir}\\dist\\index.html` });
    expect(safeOpenTarget("..\\..\\secrets.html", dir, win)).toBeUndefined();
    expect(safeOpenTarget("C:\\Windows\\win.ini", dir, win)).toBeUndefined();
    expect(safeOpenTarget("run.bat", dir, win)).toBeUndefined();
    expect(safeOpenTarget("https://www.figma.com/design/abc/Site", dir, win)).toEqual({
      kind: "url",
      url: "https://www.figma.com/design/abc/Site",
    });
    expect(safeOpenTarget("https://evil.example.com", dir, win)).toBeUndefined();
    expect(safeOpenTarget("javascript:alert(1)", dir, win)).toBeUndefined();
    expect(safeOpenTarget("file:///C:/Windows/system.ini", dir, win)).toBeUndefined();
  });

  it("reads config with warnings", () => {
    const warnings: string[] = [];
    expect(readDeepConfig({ maxMinutes: 20, model: "opus", permissionMode: "auto" }, warnings)).toMatchObject({
      maxMinutes: 20,
      model: "opus",
      permissionMode: "auto",
    });
    expect(warnings).toEqual([]);
    readDeepConfig({ maxMinutes: 9999, permissionMode: "bypassPermissions" }, warnings);
    expect(warnings).toHaveLength(2);
  });

  it("turns failures into short spoken reasons", () => {
    expect(deepFailure("", "Error: Invalid API key · Please run /login")).toContain("signed in");
    expect(deepFailure("", "error: unknown option '--verbose'")).toContain("claude update");
    expect(deepFailure("", "", Object.assign(new Error("spawn claude ENOENT")))).toContain("couldn't be started");
  });
});

class FakeProcess extends EventEmitter implements DeepProcess {
  pid = 4321;
  input = "";
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  stdin = { end: (text: string) => void (this.input = text) };
  kill = vi.fn(() => true);
  emitLine(event: unknown) {
    this.stdout.emit("data", Buffer.from(`${JSON.stringify(event)}\n`));
  }
}

function fakeHost(overrides: Partial<DeepHost> = {}) {
  const files = new Map<string, string>();
  const child = new FakeProcess();
  const said: string[] = [];
  const opened: unknown[] = [];
  const spawn = vi.fn(() => child);
  const host: DeepHost = {
    config: () => DEFAULT_DEEP,
    workspace: () => "C:\\b",
    findClaude: () => "C:\\Users\\me\\.local\\bin\\claude.exe",
    spawn,
    killTree: vi.fn(),
    exists: (file) => files.has(file),
    mkdir: () => undefined,
    readFile: (file) => files.get(file),
    writeFile: (file, text) => void files.set(file, text),
    appendFile: (file, text) => void files.set(file, (files.get(file) ?? "") + text),
    listDirs: () => [{ name: "site", mtimeMs: 1 }],
    open: async (target) => void opened.push(target),
    changed: () => undefined,
    announce: (line) => void said.push(line),
    now: () => new Date(2026, 10, 27, 14, 0),
    ...overrides,
  };
  return { host, files, child, said, opened, spawn };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("DeepAgent", () => {
  it("runs Claude Code in the project folder and announces the result", async () => {
    const { host, files, child, said, opened, spawn } = fakeHost();
    const agent = new DeepAgent(host);
    const reply = await agent.handle({ tool: "deep_task", action: "start", project: "Portfolio Site", task: "Build my portfolio" });
    expect(reply).toMatch(/^OK: deep think started on "portfolio-site"/);
    expect(spawn).toHaveBeenCalledWith(
      "C:\\Users\\me\\.local\\bin\\claude.exe",
      expect.arrayContaining(["-p", "stream-json"]),
      path.join("C:\\b", "portfolio-site"),
      false,
    );
    expect(child.input).toContain("Build my portfolio");
    expect(files.get(path.join("C:\\b", "portfolio-site", ".claude", "settings.local.json"))).toContain("git push");

    child.emitLine({ type: "system", subtype: "init", session_id: "11111111-aaaa", mcp_servers: [] });
    child.emitLine({ type: "assistant", message: { content: [{ type: "tool_use", name: "Write", input: { file_path: "x/index.html" } }] } });
    expect(agent.status()).toContain("writing index.html");
    expect(await agent.handle({ tool: "deep_task", action: "start", project: "other", task: "x" })).toMatch(/^Refused/);

    child.emitLine({ type: "result", subtype: "success", result: "Done.\nSPOKEN: Your portfolio is live on your PC.\nOPEN: index.html", session_id: "11111111-aaaa" });
    child.emit("close", 0);
    await flush();
    expect(said).toEqual(["Your portfolio is live on your PC."]);
    expect(opened).toEqual([{ kind: "file", path: path.resolve(path.join("C:\\b", "portfolio-site"), "index.html") }]);
    expect(agent.status()).toBe("");
    expect(files.get(path.join("C:\\b", "portfolio-site", ".jarvis", "session.json"))).toContain("11111111-aaaa");

    // A follow-up on the same project resumes that session.
    const next = fakeHost({ readFile: (file) => files.get(file) });
    await new DeepAgent(next.host).handle({ tool: "deep_task", action: "start", project: "portfolio site", task: "make it blue" });
    expect(next.spawn.mock.calls[0][1]).toEqual(expect.arrayContaining(["--resume", "11111111-aaaa"]));
    expect(next.child.input).toContain("change");
  });

  it("explains a missing install and a failed run", async () => {
    const missing = fakeHost({ findClaude: () => undefined });
    expect(await new DeepAgent(missing.host).handle({ tool: "deep_task", action: "start", project: "a", task: "b" })).toMatch(
      /isn't installed/,
    );

    const { host, child, said } = fakeHost();
    const agent = new DeepAgent(host);
    await agent.handle({ tool: "deep_task", action: "start", project: "a", task: "b" });
    child.stderr.emit("data", "Invalid API key · Please run /login");
    child.emit("close", 1);
    await flush();
    expect(said[0]).toContain("isn't signed in");
  });

  it("cancels and reports status", async () => {
    const { host, child, said } = fakeHost();
    const agent = new DeepAgent(host);
    expect(await agent.handle({ tool: "deep_task", action: "status", project: "", task: "" })).toContain("Recent projects: site");
    await agent.handle({ tool: "deep_task", action: "start", project: "a", task: "b" });
    expect(await agent.handle({ tool: "deep_task", action: "cancel", project: "", task: "" })).toMatch(/stopped deep think on a/);
    expect(host.killTree).toHaveBeenCalledWith(4321);
    child.emit("close", null);
    await flush();
    expect(said).toEqual([]);
  });

  it("quotes a .cmd launcher for cmd.exe", async () => {
    const { host, spawn } = fakeHost({ findClaude: () => "C:\\Users\\Mario Rio\\AppData\\Roaming\\npm\\claude.cmd" });
    await new DeepAgent(host).handle({ tool: "deep_task", action: "start", project: "a", task: "b" });
    expect(spawn.mock.calls[0][0]).toBe('"C:\\Users\\Mario Rio\\AppData\\Roaming\\npm\\claude.cmd"');
    expect(spawn.mock.calls[0][3]).toBe(true);
  });
});
