import { execFile, spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import { windowsPowershellPath } from "../src/discovery/start-apps";
import { createWindowSession } from "../src/main/window-snapshot";

const PROBE = `
Add-Type -AssemblyName System.Windows.Forms
$form = New-Object System.Windows.Forms.Form
$form.Text = "JarvisPlaceProbe"
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::Sizable
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
$form.Location = New-Object System.Drawing.Point(40, 40)
$form.Size = New-Object System.Drawing.Size(420, 320)
$form.ShowInTaskbar = $true
$form.Show()
[Console]::Out.WriteLine(("HWND " + $form.Handle.ToInt64()))
[Console]::Out.Flush()
$end = (Get-Date).AddSeconds(30)
while ((Get-Date) -lt $end -and -not $form.IsDisposed) {
  [System.Windows.Forms.Application]::DoEvents()
  Start-Sleep -Milliseconds 50
}
if (-not $form.IsDisposed) { $form.Close() }
`;

function taskkill(pid: number): void {
  const root = process.env.SystemRoot?.trim().replace(/[\\/]+$/, "") || "C:\\Windows";
  execFile(`${root}\\System32\\taskkill.exe`, ["/T", "/F", "/PID", String(pid)], { windowsHide: true }, () => undefined);
}

function startProbe(): Promise<{ pid: number; hwnd: number; stop: () => void }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      windowsPowershellPath(process.env.SystemRoot),
      ["-NoProfile", "-NonInteractive", "-STA", "-Command", PROBE],
      { windowsHide: false, stdio: ["ignore", "pipe", "pipe"] },
    );
    const pid = child.pid;
    let buffer = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      if (pid) taskkill(pid);
      reject(new Error("probe window did not report a hwnd"));
    }, 15_000);
    const finish = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (pid) taskkill(pid);
      reject(error);
    };
    child.on("error", finish);
    child.stdout?.on("data", (chunk: Buffer | string) => {
      buffer += chunk.toString();
      const match = buffer.match(/HWND (\d+)/);
      if (!match || !pid || settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        pid,
        hwnd: Number(match[1]),
        stop: () => taskkill(pid),
      });
    });
    child.on("exit", () => {
      if (!settled) finish(new Error("probe window exited before reporting a hwnd"));
    });
  });
}

describe("live window list", () => {
  it.skipIf(process.platform !== "win32")("returns sane top-level windows on Windows", async () => {
    const session = createWindowSession({ platform: process.platform, env: process.env });
    session.start();
    const snap = await session.sample(20_000);
    const code = await session.stop();
    expect(code).toBe(0);
    expect(snap).toBeDefined();
    if (!snap) return;
    expect(snap.foreground).toBeGreaterThanOrEqual(0);
    expect(snap.windows.length).toBeGreaterThan(0);
    expect(snap.windows.some((window) => window.className.length > 0)).toBe(true);
    for (const window of snap.windows) {
      expect(window.hwnd).toBeGreaterThan(0);
      expect(window.pid).toBeGreaterThan(0);
      expect(typeof window.className).toBe("string");
      expect(window.width).toBeGreaterThan(0);
      expect(window.height).toBeGreaterThan(0);
      expect(window.dpi).toBeGreaterThanOrEqual(96);
      expect(typeof window.owned).toBe("boolean");
      expect(typeof window.exe).toBe("string");
    }
  }, 30_000);

  it.skipIf(process.platform !== "win32")(
    "moves only a window this test created",
    async () => {
      const probe = await startProbe();
      const session = createWindowSession({ platform: "win32", env: process.env });
      session.start();
      const watch = session.serve(8_000);
      const rect = { x: 160, y: 180, width: 500, height: 380 };
      try {
        let seen = false;
        const deadline = Date.now() + 12_000;
        while (Date.now() < deadline) {
          const snap = await watch.nextSample();
          if (!snap) break;
          if (snap.windows.some((window) => window.hwnd === probe.hwnd)) {
            seen = true;
            break;
          }
        }
        expect(seen).toBe(true);
        expect(await watch.place(probe.hwnd, rect)).toBe(true);

        let found: { x: number; y: number; width: number; height: number } | undefined;
        for (let attempt = 0; attempt < 6; attempt += 1) {
          const snap = await session.sample(2_000);
          const window = snap?.windows.find((item) => item.hwnd === probe.hwnd);
          if (
            window &&
            Math.abs(window.x - rect.x) <= 12 &&
            Math.abs(window.y - rect.y) <= 12 &&
            Math.abs(window.width - rect.width) <= 12 &&
            Math.abs(window.height - rect.height) <= 12
          ) {
            found = window;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
        expect(found).toBeDefined();
      } finally {
        watch.close();
        const code = await session.stop();
        expect(code).toBe(0);
        probe.stop();
      }
    },
    45_000,
  );
});
