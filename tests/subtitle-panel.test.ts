import { describe, expect, it } from "vitest";
import {
  boxesOverlap,
  layoutHud,
  placedTileBoxes,
  subtitlePanelBox,
  viewportAboveSubtitle,
  type HudLayout,
} from "../src/shared/ring";

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

function tilesPerPage(layout: HudLayout): number {
  const counts = Array.from({ length: layout.pageCount }, () => 0);
  for (const segment of layout.segments) counts[segment.page] += 1;
  return Math.min(...counts);
}

function fullestRing(layout: HudLayout): number {
  const counts = new Map<string, number>();
  for (const segment of layout.segments) {
    const key = `${segment.page}:${segment.ring}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Math.max(0, ...counts.values());
}

describe("small windows with voice on", () => {
  it("pages about as well as voice off and keeps every tile inside the viewport", () => {
    const viewports = [
      { width: 853, height: 480 },
      { width: 911, height: 512 },
    ];
    const tiles = labels.slice(0, 10).map((label) => ({ label }));
    for (const phase of ["idle", "speaking"] as const) {
      expect(phase === "idle" || phase === "speaking").toBe(true);
      for (const viewport of viewports) {
        const off = layoutHud(tiles, viewport);
        const onViewport = viewportAboveSubtitle(viewport);
        const on = layoutHud(tiles, onViewport);
        const ring = fullestRing(off);
        expect(tilesPerPage(on)).toBeGreaterThanOrEqual(tilesPerPage(off) - ring);
        expect(on.pageCount).toBeLessThanOrEqual(off.pageCount + 1);
        expect(on.pageCount).toBeLessThan(tiles.length);
        for (const box of placedTileBoxes(on, onViewport)) {
          expect(box.left).toBeGreaterThanOrEqual(-0.5);
          expect(box.top).toBeGreaterThanOrEqual(-0.5);
          expect(box.right).toBeLessThanOrEqual(viewport.width + 0.5);
          expect(box.bottom).toBeLessThanOrEqual(viewport.height + 0.5);
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
