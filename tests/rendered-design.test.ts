import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { build, preview, type PreviewServer } from "vite";

const PORT = 4181;
const VIEWPORTS = [
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
  { width: 1280, height: 1024 },
  { width: 1504, height: 1003 },
  { width: 2560, height: 1080 },
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

  const WIDE_FONT = `:root { --f-label: Verdana, "DejaVu Sans", sans-serif !important; }`;

  it.each([
    ...VIEWPORTS.map((viewport) => ({ viewport, wideFont: false })),
    // A machine without the narrow design fonts (CI's Linux runner) falls back to a wider face.
    { viewport: VIEWPORTS[0], wideFont: true },
    { viewport: VIEWPORTS[1], wideFont: true },
  ])("fills the screen and keeps every label inside its slot at $viewport.width x $viewport.height, wide font $wideFont", async ({ viewport, wideFont }) => {
    const page = await browser.newPage({ viewport });
    if (wideFont) {
      await page.addInitScript((css) => {
        document.addEventListener("DOMContentLoaded", () => {
          const style = document.createElement("style");
          style.textContent = css;
          document.head.append(style);
        });
      }, WIDE_FONT);
    }
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
      // Slot buttons and the bottom tray must not land on each other after the spare room is spread.
      const boxes = [...document.querySelectorAll<HTMLElement>(".tab, .launcher, .plate-btn, .cmd, .page-btn, .round-btn")].map(
        (node) => ({
          name: node.getAttribute("aria-label") || node.className,
          tab: node.classList.contains("tab"),
          rect: node.getBoundingClientRect(),
        }),
      );
      const overlaps: string[] = [];
      boxes.forEach((a, i) =>
        boxes.slice(i + 1).forEach((b) => {
          const x = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
          const y = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
          // Neighbouring tabs share a slanted edge in the design.
          if (x > 1 && y > 1 && !(a.tab && b.tab)) overlaps.push(`${a.name} / ${b.name}`);
        }),
      );
      return {
        overlaps,
        canvas: { left: canvas.left, top: canvas.top, right: canvas.right, bottom: canvas.bottom },
        clipped,
        tabs: document.querySelectorAll(".tab").length,
        launchers: document.querySelectorAll(".launcher").length,
      };
    });
    await page.close();
    expect(report.tabs).toBe(6);
    expect(report.launchers).toBe(6);
    // No black bars: the canvas covers the whole window, edge to edge.
    expect(report.canvas.left).toBeCloseTo(0, 0);
    expect(report.canvas.top).toBeCloseTo(0, 0);
    expect(report.canvas.right).toBeCloseTo(viewport.width, 0);
    expect(report.canvas.bottom).toBeCloseTo(viewport.height, 0);
    expect(report.overlaps).toEqual([]);
    expect(report.clipped).toEqual([]);
  });
});
