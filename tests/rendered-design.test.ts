import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { build, preview, type PreviewServer } from "vite";

const PORT = 4181;
const VIEWPORTS = [
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
  { width: 1280, height: 1024 },
];

describe("rendered MARIO OS canvas", () => {
  let browser: Browser;
  let server: PreviewServer;

  beforeAll(async () => {
    await build({ logLevel: "silent" });
    server = await preview({ preview: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "silent" });
    browser = await chromium.launch({ headless: true });
  }, 180_000);

  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  it.each(VIEWPORTS)("fits the screen and keeps every label inside its slot at %j", async (viewport) => {
    const page = await browser.newPage({ viewport });
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForSelector(".tab .slot-text");
    await page.evaluate(() => document.fonts.ready);
    const report = await page.evaluate(() => {
      const canvas = document.querySelector(".mario-canvas")!.getBoundingClientRect();
      const clipped: string[] = [];
      for (const button of document.querySelectorAll<HTMLElement>(".tab, .launcher, .plate-btn")) {
        const box = button.getBoundingClientRect();
        const text = button.querySelector<HTMLElement>(".slot-text, .plate-label");
        if (!text || !text.textContent) continue;
        const inner = text.getBoundingClientRect();
        // Tabs are clipped on a slant: 85% of the width at the top, 100% at the bottom.
        const mid = (inner.top + inner.bottom) / 2;
        const slant = 0.85 + 0.15 * Math.max(0, Math.min(1, (mid - box.top) / box.height));
        const limit = button.classList.contains("tab") ? box.left + box.width * slant : box.right;
        if (inner.left < box.left - 0.5 || inner.right > limit + 0.5 || inner.bottom > box.bottom + 0.5) {
          clipped.push(text.textContent);
        }
      }
      return {
        canvas: { left: canvas.left, top: canvas.top, right: canvas.right, bottom: canvas.bottom },
        clipped,
        tabs: document.querySelectorAll(".tab").length,
        launchers: document.querySelectorAll(".launcher").length,
      };
    });
    await page.close();
    expect(report.tabs).toBe(6);
    expect(report.launchers).toBe(6);
    expect(report.canvas.left).toBeGreaterThanOrEqual(-0.5);
    expect(report.canvas.top).toBeGreaterThanOrEqual(-0.5);
    expect(report.canvas.right).toBeLessThanOrEqual(viewport.width + 0.5);
    expect(report.canvas.bottom).toBeLessThanOrEqual(viewport.height + 0.5);
    expect(Math.max(report.canvas.right - report.canvas.left, report.canvas.bottom - report.canvas.top)).toBeGreaterThan(
      Math.min(viewport.width, viewport.height),
    );
    expect(report.clipped).toEqual([]);
  });
});
