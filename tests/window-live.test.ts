import { describe, expect, it } from "vitest";
import { listTopLevelWindows } from "../src/main/window-snapshot";

describe("live window list", () => {
  it("returns sane top-level windows on Windows", async () => {
    if (process.platform !== "win32") return;
    const snap = await listTopLevelWindows();
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
});
