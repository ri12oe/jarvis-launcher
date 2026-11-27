import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import http from "node:http";
import { describe, expect, it } from "vitest";
import { createEndpoint, MAX_UTTERANCE_MS, stepEndpoint, type EndpointState } from "../src/shared/voice-audio";
import { allowedHost, contentType, previewFile, previewUrlPath } from "../src/shared/preview";
import { PreviewServer } from "../src/main/preview-server";
import { cloneDefaultConfig, parseConfig } from "../src/shared/config";

const RATE = 16000;
const chunk = (ms: number, loud: boolean) => new Int16Array((RATE * ms) / 1000).fill(loud ? 4000 : 0);

function feed(state: EndpointState, parts: [number, boolean][], pauseMs?: number) {
  let result = { state, done: false, speech: false };
  for (const [ms, loud] of parts) {
    for (let t = 0; t < ms && !result.done; t += 100) result = stepEndpoint(result.state, chunk(100, loud), RATE, pauseMs);
    if (result.done) break;
  }
  return result;
}

describe("listening", () => {
  it("keeps listening through a one-second pause mid-request", () => {
    const result = feed(createEndpoint(), [[1500, true], [1100, false], [1500, true]]);
    expect(result.done).toBe(false);
    expect(feed(result.state, [[1700, false]]).done).toBe(true);
  });

  it("allows longer thinking pauses once the request is long", () => {
    const long = feed(createEndpoint(), [[5000, true], [1800, false]]);
    expect(long.done).toBe(false);
    expect(feed(long.state, [[500, false]]).done).toBe(true);
  });

  it("lets a long request run past the old eight seconds, up to a minute", () => {
    const talking = feed(createEndpoint(), [[20000, true]]);
    expect(talking.done).toBe(false);
    expect(feed(talking.state, [[MAX_UTTERANCE_MS, true]]).done).toBe(true);
  });

  it("uses voice.pauseMs", () => {
    expect(feed(createEndpoint(), [[1000, true], [900, false]], 800).done).toBe(true);
    expect(feed(createEndpoint(), [[1000, true], [2500, false]], 3000).done).toBe(false);
    expect(cloneDefaultConfig().voice.pauseMs).toBeUndefined();
    expect(parseConfig({ voice: { pauseMs: 2200 } }).config.voice.pauseMs).toBe(2200);
    const bad = parseConfig({ voice: { pauseMs: 20000 } });
    expect(bad.config.voice.pauseMs).toBeUndefined();
    expect(bad.warnings.join(" ")).toContain("voice.pauseMs");
  });
});

describe("preview paths", () => {
  const root = "C:\\b\\site";
  it("maps requests to files inside the project only", () => {
    expect(previewFile(root, "/", path.win32)).toBe("C:\\b\\site");
    expect(previewFile(root, "/dist/assets/index-abc.js?v=1", path.win32)).toBe("C:\\b\\site\\dist\\assets\\index-abc.js");
    expect(previewFile(root, "/my%20page.html", path.win32)).toBe("C:\\b\\site\\my page.html");
    expect(previewFile(root, "/../secret.txt", path.win32)).toBeUndefined();
    expect(previewFile(root, "/%2e%2e/%2e%2e/Windows/win.ini", path.win32)).toBeUndefined();
    expect(previewFile(root, "/..%5c..%5cwin.ini", path.win32)).toBeUndefined();
    expect(previewFile(root, "/.jarvis/last-run.jsonl", path.win32)).toBeUndefined();
    expect(previewFile(root, "/.claude/settings.local.json", path.win32)).toBeUndefined();
    expect(previewFile(root, "/.env.local", path.win32)).toBeUndefined();
    expect(previewFile(root, "/node_modules/x/index.js", path.win32)).toBeUndefined();
    expect(previewFile(root, "/%E0%A4%A", path.win32)).toBeUndefined();
  });

  it("builds URLs, types, and host checks", () => {
    expect(previewUrlPath(root, "C:\\b\\site\\dist\\index.html", path.win32)).toBe("/dist/index.html");
    expect(previewUrlPath(root, "C:\\b\\other\\index.html", path.win32)).toBeUndefined();
    expect(contentType("app.MJS")).toContain("javascript");
    expect(contentType("x.unknown")).toBe("application/octet-stream");
    expect(allowedHost("127.0.0.1:5510", 5510)).toBe(true);
    expect(allowedHost("evil.example.com:5510", 5510)).toBe(false);
    expect(allowedHost(undefined, 5510)).toBe(false);
  });
});

function get(url: string, host?: string): Promise<{ status: number; type: string; body: string }> {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    http
      .get({ hostname: target.hostname, port: target.port, path: target.pathname, headers: host ? { host } : {} }, (response) => {
        let body = "";
        response.on("data", (data) => (body += data));
        response.on("end", () => resolve({ status: response.statusCode ?? 0, type: String(response.headers["content-type"] ?? ""), body }));
      })
      .on("error", reject);
  });
}

describe("preview server", () => {
  it("serves a built site so module scripts load, and nothing outside it", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "preview-"));
    fs.mkdirSync(path.join(root, "dist", "assets"), { recursive: true });
    fs.mkdirSync(path.join(root, ".jarvis"));
    fs.writeFileSync(path.join(root, "dist", "index.html"), '<script type="module" src="./assets/app.js"></script>');
    fs.writeFileSync(path.join(root, "dist", "assets", "app.js"), "export {}");
    fs.writeFileSync(path.join(root, ".jarvis", "session.json"), "{}");
    const server = new PreviewServer();
    try {
      const base = await server.serve(root);
      expect(base).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      expect((await get(`${base}/dist/`)).body).toContain("module");
      const script = await get(`${base}/dist/assets/app.js`);
      expect(script.status).toBe(200);
      expect(script.type).toContain("text/javascript");
      expect((await get(`${base}/.jarvis/session.json`)).status).toBe(404);
      expect((await get(`${base}/dist/index.html`, "attacker.example:80")).status).toBe(403);
    } finally {
      server.stop();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
