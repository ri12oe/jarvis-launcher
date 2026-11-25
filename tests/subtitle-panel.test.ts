import { describe, expect, it } from "vitest";
import {
  boxesOverlap,
  layoutHud,
  pageControlBoxes,
  placedTileBoxes,
  subtitlePanelBox,
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

/** Fewest tiles on a full page. A short last page does not lower the minimum. */
function tilesPerPage(layout: HudLayout): number {
  if (layout.pageCount <= 1) return layout.segments.length;
  const counts = Array.from({ length: layout.pageCount - 1 }, () => 0);
  for (const segment of layout.segments) {
    if (segment.pinned) continue;
    if (segment.page < counts.length) counts[segment.page] += 1;
  }
  const present = counts.filter((count) => count > 0);
  if (present.length === 0) return layout.segments.length;
  return Math.min(...present);
}

describe("small windows with voice on", () => {
  it("pages about as well as voice off and keeps every tile inside the viewport", () => {
    const viewports = [
      { width: 853, height: 480 },
      { width: 911, height: 512 },
    ];
    const tiles = labels.slice(0, 10).map((label) => ({ label }));
    for (const viewport of viewports) {
      const off = layoutHud(tiles, viewport);
      const on = layoutHud(tiles, viewport, undefined, { subtitle: true });
      expect(tilesPerPage(on)).toBeGreaterThanOrEqual(Math.max(1, tilesPerPage(off) - 4));
      expect(on.pageCount).toBeLessThanOrEqual(off.pageCount + 1);
      expect(on.pageCount).toBeLessThan(tiles.length);
        for (const box of placedTileBoxes(on)) {
        expect(box.left).toBeGreaterThanOrEqual(-0.5);
        expect(box.top).toBeGreaterThanOrEqual(-0.5);
        expect(box.right).toBeLessThanOrEqual(viewport.width + 0.5);
        expect(box.bottom).toBeLessThanOrEqual(viewport.height + 0.5);
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
        const layout = layoutHud(tiles, viewport, undefined, { subtitle: true });
        const panel = subtitlePanelBox(viewport);
        expect(layout.segments).toHaveLength(count);
        for (const box of placedTileBoxes(layout)) {
          expect(boxesOverlap(box, panel)).toBe(false);
        }
        expect(panel.bottom).toBeLessThanOrEqual(viewport.height - 72);
        expect(panel.right - panel.left).toBeGreaterThan(160);
      }
    }
  });
});

describe("page controls", () => {
  const viewports = [
    { width: 853, height: 480 },
    { width: 911, height: 512 },
    { width: 1093, height: 614 },
    { width: 1366, height: 768 },
  ];

  function named(count: number, long: boolean): Array<{ label: string }> {
    return Array.from({ length: count }, (_, index) => ({
      label: long
        ? `${labels[index % labels.length]} Workspace Project Notes ${index + 1}`
        : `${labels[index % labels.length]} ${index + 1}`,
    }));
  }

  it("pages a long segment list instead of stacking every tile on one ring", () => {
    const viewport = { width: 1093, height: 614 };
    const layout = layoutHud(named(36, false), viewport);
    expect(layout.pageCount).toBeGreaterThan(1);
    expect(layout.segments).toHaveLength(36);
    const pages = Array.from({ length: layout.pageCount }, () => 0);
    for (const segment of layout.segments) pages[segment.page] += 1;
    expect(Math.max(...pages)).toBeLessThan(36);
  });

  it.each(viewports.map((viewport) => [viewport.width, viewport.height] as const))(
    "does not cover a tile from 8 to 48 tiles at %ix%i",
    (width, height) => {
      const viewport = { width, height };
      for (let count = 8; count <= 48; count++) {
        for (const long of [false, true]) {
          const tiles = named(count, long);
          for (const voice of [false, true]) {
            const layout = layoutHud(tiles, viewport, undefined, { subtitle: voice });
            if (layout.pageCount < 2) continue;
            const controls = pageControlBoxes(viewport, layout.pageCount);
            for (const segment of layout.segments) {
              for (const control of controls) {
                expect(boxesOverlap(segment.icon, control), `${count} voice ${voice} long ${long}`).toBe(false);
                expect(boxesOverlap(segment.label, control), `${count} voice ${voice} long ${long}`).toBe(false);
              }
            }
          }
        }
      }
    },
    30_000,
  );
});
