import { describe, expect, it } from "vitest";
import { boxesOverlap, layoutHud, placedTileBoxes, subtitlePanelBox, viewportAboveSubtitle } from "../src/shared/ring";

const labels = [
  "ChatGPT",
  "Claude",
  "Cursor",
  "Grok",
  "Copilot",
  "Perplexity",
  "Ollama",
  "LM Studio",
  "Microsoft Edge",
  "File Explorer",
  "Desktop",
  "Documents",
  "Downloads",
  "Pictures",
  "Module 1",
  "Module 2",
  "Module 3",
  "Module 4",
  "Module 5",
  "Module 6",
  "Module 7",
  "Module 8",
  "Module 9",
  "Module 10",
];

describe("small windows with voice on", () => {
  it("keeps every tile inside the viewport while the subtitle space is reserved", () => {
    const viewports = [
      { width: 853, height: 480 },
      { width: 911, height: 512 },
    ];
    const tiles = labels.slice(0, 14).map((label) => ({ label }));
    for (const phase of ["idle", "speaking"] as const) {
      expect(phase === "idle" || phase === "speaking").toBe(true);
      for (const viewport of viewports) {
        const layoutViewport = viewportAboveSubtitle(viewport);
        const layout = layoutHud(tiles, layoutViewport);
        const windowBox = { left: 0, top: 0, right: viewport.width, bottom: viewport.height };
        expect(layout.segments.length).toBe(tiles.length);
        for (const box of placedTileBoxes(layout, layoutViewport)) {
          expect(box.left).toBeGreaterThanOrEqual(windowBox.left - 0.5);
          expect(box.top).toBeGreaterThanOrEqual(windowBox.top - 0.5);
          expect(box.right).toBeLessThanOrEqual(windowBox.right + 0.5);
          expect(box.bottom).toBeLessThanOrEqual(windowBox.bottom + 0.5);
        }
        for (const size of layout.reactor) {
          expect(size).toBeLessThanOrEqual(viewport.height);
          expect(size).toBeLessThanOrEqual(480);
        }
      }
    }
  });
});

describe("voice subtitle panel", () => {
  it("stays clear of every tile at 10 and 24 tiles", () => {
    const viewports = [
      { width: 1366, height: 768 },
      { width: 1920, height: 1080 },
    ];
    for (const count of [10, 24]) {
      const tiles = labels.slice(0, count).map((label) => ({ label }));
      for (const viewport of viewports) {
        const layoutViewport = viewportAboveSubtitle(viewport);
        const layout = layoutHud(tiles, layoutViewport);
        const panel = subtitlePanelBox(viewport);
        expect(layout.segments).toHaveLength(count);
        for (const box of placedTileBoxes(layout, layoutViewport)) {
          expect(boxesOverlap(box, panel)).toBe(false);
        }
        expect(panel.bottom).toBeLessThanOrEqual(viewport.height - 72);
        expect(panel.right - panel.left).toBeGreaterThan(160);
      }
    }
  });
});
