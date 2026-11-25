import { describe, expect, it } from "vitest";
import { AI_APP_IDS, BUILTIN_IDS } from "../src/shared/types";
import { boxesOverlap, layoutHud, pageControlBoxes, tileZone, type Aabb, type RingPlacement, type Viewport } from "../src/shared/ring";

const VIEWPORTS: Viewport[] = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 853, height: 480 },
];

const AI_LABELS = ["ChatGPT", "Claude", "Cursor", "Grok", "Copilot", "Perplexity", "Ollama", "LM Studio"];
const RAIL_LABELS = ["Microsoft Edge", "File Explorer", "Desktop", "Documents", "Downloads", "Pictures"];

function standardTiles(extra: number): Array<{ id: string; label: string; kind: string }> {
  const tiles = [
    ...AI_APP_IDS.map((id, index) => ({ id, label: AI_LABELS[index] ?? id, kind: "app" })),
    ...BUILTIN_IDS.map((id, index) => ({
      id,
      label: RAIL_LABELS[index] ?? id,
      kind: id === "explorer" ? "system" : id === "edge" ? "app" : "folder",
    })),
  ];
  for (let index = 0; index < extra; index++) tiles.push({ id: `extra-${index}`, label: `Module ${index + 1}`, kind: "app" });
  return tiles;
}

function pageBoxes(layout: ReturnType<typeof layoutHud>, page: number): Array<{ name: string; box: Aabb }> {
  return layout.segments
    .filter((segment) => segment.pinned || segment.page === page)
    .map((segment) => ({ name: `${segment.zone}:${segment.index}`, box: segment.icon }));
}

function overlapOn(boxes: Array<{ name: string; box: Aabb }>): string | null {
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (boxesOverlap(boxes[i].box, boxes[j].box, 0)) return `${boxes[i].name} overlaps ${boxes[j].name}`;
    }
  }
  return null;
}

function offScreen(box: Aabb, viewport: Viewport): boolean {
  return box.left < -0.5 || box.top < -0.5 || box.right > viewport.width + 0.5 || box.bottom > viewport.height + 0.5;
}

describe("shield tile slots", () => {
  it("sends fixed tiles to the rail, AI apps to the tabs, and the rest to the reactor", () => {
    const tiles = standardTiles(3);
    const layout = layoutHud(tiles, { width: 1920, height: 1080 });
    for (const segment of layout.segments) {
      expect(segment.zone).toBe(tileZone(tiles[segment.index]));
    }
    expect(layout.segments.filter((segment) => segment.zone === "tab")).toHaveLength(AI_APP_IDS.length);
    expect(layout.segments.filter((segment) => segment.zone === "rail")).toHaveLength(BUILTIN_IDS.length);
    expect(layout.segments.filter((segment) => segment.zone === "segment")).toHaveLength(3);
    expect(layout.pageCount).toBe(1);
  });

  it.each(VIEWPORTS.map((viewport) => [viewport.width, viewport.height] as const))(
    "keeps the standard slots inside the window and apart at %ix%i",
    (width, height) => {
      const viewport = { width, height };
      const tiles = standardTiles(4);
      for (const subtitle of [false, true]) {
        const layout = layoutHud(tiles, viewport, undefined, { subtitle });
        expect(layout.segments).toHaveLength(tiles.length);
        for (let page = 0; page < layout.pageCount; page++) {
          const boxes = pageBoxes(layout, page);
          expect(overlapOn(boxes), `${width}x${height} subtitle ${subtitle} page ${page}`).toBeNull();
          for (const entry of boxes) {
            expect(offScreen(entry.box, viewport), entry.name).toBe(false);
          }
        }
        for (const segment of layout.segments) {
          if (segment.zone === "rail") expect(segment.icon.right).toBeLessThanOrEqual(layout.frame.railW + 1);
          if (segment.zone === "tab") expect(segment.icon.bottom).toBeLessThanOrEqual(layout.frame.header + 1);
          if (segment.zone === "segment") {
            const dx = segment.x - layout.frame.cx;
            const dy = segment.y - layout.frame.cy;
            expect(Math.hypot(dx, dy)).toBeGreaterThan(layout.frame.reactor * 0.2);
            expect(Math.hypot(dx, dy)).toBeLessThan(layout.frame.reactor * 0.72);
          }
        }
      }
    },
  );

  it("pages extra reactor tiles and still keeps each page free of overlaps", () => {
    const tiles = standardTiles(28);
    for (const viewport of VIEWPORTS) {
      const layout = layoutHud(tiles, viewport);
      expect(layout.pageCount).toBeGreaterThan(1);
      expect(layout.segments).toHaveLength(tiles.length);
      const controls = pageControlBoxes(viewport, layout.pageCount);
      for (let page = 0; page < layout.pageCount; page++) {
        const boxes = pageBoxes(layout, page);
        expect(overlapOn(boxes), `${viewport.width} page ${page}`).toBeNull();
        for (const entry of boxes) expect(offScreen(entry.box, viewport)).toBe(false);
        for (const entry of boxes) {
          for (const control of controls) {
            expect(boxesOverlap(entry.box, control)).toBe(false);
          }
        }
      }
      const visible = (page: number) => layout.segments.filter((segment) => show(segment, page));
      expect(visible(0).some((segment) => segment.zone === "rail")).toBe(true);
      expect(visible(layout.pageCount - 1).some((segment) => segment.zone === "rail")).toBe(true);
      expect(visible(layout.pageCount - 1).some((segment) => segment.zone === "segment")).toBe(true);
    }
  });
});

function show(segment: RingPlacement, page: number): boolean {
  return segment.pinned === true || segment.page === page;
}
