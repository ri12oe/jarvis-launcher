import { describe, expect, it } from "vitest";
import type { GridKey } from "../src/shared/grid";
import {
  HUD_FILL,
  ICON_SIZE,
  boxesOverlap,
  labelSide,
  layoutHud,
  measureLabel,
  minArcSpacing,
  nextRingTile,
  radiusForArcSpacing,
  segmentAngle,
  segmentPoint,
  type Aabb,
  type HudLayout,
  type RingPlacement,
  type Viewport,
} from "../src/shared/ring";

const NAMES = [
  "ChatGPT",
  "Claude",
  "Cursor",
  "Grok",
  "Microsoft Edge",
  "File Explorer",
  "Desktop",
  "Documents",
  "Downloads",
  "Pictures",
  "Copilot",
  "Perplexity",
  "Ollama",
  "LM Studio",
  "Visual Studio Code",
  "Windows Terminal",
];

function tiles(count: number): Array<{ label: string }> {
  return Array.from({ length: count }, (_, index) => ({
    label: index % 5 === 0 ? `${NAMES[index % NAMES.length]} Workspace Project` : NAMES[index % NAMES.length],
  }));
}

function intersects(a: Aabb, b: Aabb): boolean {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return width > 0.5 && height > 0.5;
}

function overlapOnPage(layout: HudLayout): string | null {
  for (let page = 0; page < layout.pageCount; page++) {
    const visible = layout.segments.filter((segment) => segment.page === page);
    const boxes = visible.flatMap((segment) => [
      { name: `${segment.index} icon`, box: segment.icon },
      { name: `${segment.index} label`, box: segment.label },
    ]);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        if ((i ^ 1) === j && i % 2 === 0) continue;
        if (intersects(boxes[i].box, boxes[j].box)) return `page ${page}: ${boxes[i].name} overlaps ${boxes[j].name}`;
      }
    }
  }
  return null;
}

function reachable(layout: HudLayout): number {
  if (layout.segments.length === 0) return 0;
  const byPage = new Map<number, RingPlacement[]>();
  for (const segment of layout.segments) {
    const list = byPage.get(segment.page) ?? [];
    list.push(segment);
    byPage.set(segment.page, list);
  }
  const seen = new Set<number>();
  const queue = [layout.segments[0].index];
  const keys: GridKey[] = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
  while (queue.length > 0) {
    const index = queue.pop();
    if (index == null || seen.has(index)) continue;
    seen.add(index);
    const segment = layout.segments[index];
    const visible = byPage.get(segment.page) ?? [];
    for (const key of keys) {
      const next = nextRingTile(index, visible, key);
      if (next >= 0) queue.push(next);
    }
    for (const direction of [-1, 1]) {
      const neighbor = byPage.get(segment.page + direction);
      if (neighbor && neighbor.length > 0) queue.push(neighbor[0].index);
    }
  }
  return seen.size;
}

describe("segment angles and positions", () => {
  it("starts at the top and steps clockwise", () => {
    expect(segmentAngle(0, 4)).toBeCloseTo(0);
    expect(segmentAngle(1, 4)).toBeCloseTo(Math.PI / 2);
    expect(segmentAngle(2, 4)).toBeCloseTo(Math.PI);
    expect(segmentAngle(3, 4)).toBeCloseTo((3 * Math.PI) / 2);
    expect(segmentAngle(4, 4)).toBeCloseTo(0);
    expect(segmentAngle(-1, 4)).toBeCloseTo((3 * Math.PI) / 2);
  });

  it("spaces N tiles by a full turn", () => {
    for (const count of [1, 2, 3, 6, 8, 12]) {
      for (let slot = 0; slot < count; slot++) {
        let step = segmentAngle(slot + 1, count) - segmentAngle(slot, count);
        if (step <= 0) step += Math.PI * 2;
        expect(step).toBeCloseTo((Math.PI * 2) / count);
      }
    }
  });

  it("maps the cardinal angles onto the screen axes", () => {
    const top = segmentPoint(0, 100);
    const right = segmentPoint(Math.PI / 2, 100);
    const bottom = segmentPoint(Math.PI, 50);
    const left = segmentPoint((3 * Math.PI) / 2, 80);
    expect(top.x).toBeCloseTo(0);
    expect(top.y).toBeCloseTo(-100);
    expect(right.x).toBeCloseTo(100);
    expect(right.y).toBeCloseTo(0);
    expect(bottom.x).toBeCloseTo(0);
    expect(bottom.y).toBeCloseTo(50);
    expect(left.x).toBeCloseTo(-80);
    expect(left.y).toBeCloseTo(0);
  });

  it("points labels away from the core", () => {
    expect(labelSide(0)).toBe("top");
    expect(labelSide(Math.PI / 2)).toBe("right");
    expect(labelSide(Math.PI)).toBe("bottom");
    expect(labelSide((3 * Math.PI) / 2)).toBe("left");
    expect(labelSide((7 * Math.PI) / 4)).toBe("top");
  });
});

describe("arc spacing", () => {
  it("grows with the label and never drops below the icon", () => {
    const short = measureLabel("Edge");
    const long = measureLabel("Microsoft Visual Studio Code Workspace");
    expect(long.ellipsis).toBe(true);
    expect(long.width).toBeGreaterThan(short.width);
    expect(minArcSpacing(long)).toBeGreaterThan(minArcSpacing(short));
    expect(minArcSpacing(short)).toBeGreaterThanOrEqual(ICON_SIZE);
    expect(radiusForArcSpacing(8, minArcSpacing(long))).toBeGreaterThan(radiusForArcSpacing(8, minArcSpacing(short)));
  });
});

describe("ring layout", () => {
  const viewports: Array<Viewport & { name: string }> = [
    { name: "1366x768", width: 1366, height: 768 },
    { name: "1280x720@1.5x", width: 1280, height: 720 },
    { name: "1280x720 logical 150%", width: 1280 / 1.5, height: 720 / 1.5 },
  ];

  it("keeps every label and icon apart for N = 1..40, and every tile reachable", () => {
    for (const viewport of viewports) {
      for (let count = 1; count <= 40; count++) {
        const layout = layoutHud(tiles(count), viewport);
        expect(layout.segments.map((segment) => segment.index), viewport.name).toEqual(
          Array.from({ length: count }, (_, index) => index),
        );
        expect(overlapOnPage(layout), `${viewport.name} N=${count}`).toBeNull();
        expect(reachable(layout), `${viewport.name} N=${count}`).toBe(count);
        expect(layout.reactor.every((size) => size > 0)).toBe(true);
      }
    }
  });

  it("uses more than one page when the viewport cannot hold the labels", () => {
    const crowded = Array.from({ length: 18 }, (_, index) => ({ label: `Project Folder ${index} Documents` }));
    const layout = layoutHud(crowded, { width: 1280 / 1.5, height: 720 / 1.5 });
    expect(layout.pageCount).toBeGreaterThan(1);
    expect(overlapOnPage(layout)).toBeNull();
    expect(reachable(layout)).toBe(crowded.length);
  });

  it("fills about 85-90% of the height at 2560x1440", () => {
    const layout = layoutHud(tiles(6), { width: 2560, height: 1440 });
    expect(layout.pageCount).toBe(1);
    let top = Infinity;
    let bottom = -Infinity;
    for (const segment of layout.segments) {
      top = Math.min(top, segment.icon.top, segment.label.top);
      bottom = Math.max(bottom, segment.icon.bottom, segment.label.bottom);
    }
    const span = (bottom - top) / 1440;
    expect(span).toBeGreaterThanOrEqual(0.85);
    expect(span).toBeLessThanOrEqual(0.9);
    expect(HUD_FILL).toBeGreaterThanOrEqual(0.85);
    expect(HUD_FILL).toBeLessThanOrEqual(0.9);
  });

  it("puts a single tile at the top of the ring", () => {
    const layout = layoutHud([{ label: "Edge" }], { width: 1366, height: 768 });
    expect(layout.pageCount).toBe(1);
    expect(layout.segments[0]?.angle).toBeCloseTo(0);
    expect(layout.segments[0]?.side).toBe("top");
    expect(layout.segments[0]?.x).toBeCloseTo(0);
    expect(layout.segments[0]?.y).toBeLessThan(0);
  });
});

function bare(index: number, ring: number, slot: number, count: number): RingPlacement {
  const angle = segmentAngle(slot, count);
  const point = segmentPoint(angle, 120 + ring * 90);
  const empty = { left: 0, top: 0, right: 0, bottom: 0 };
  return {
    index,
    page: 0,
    ring,
    slot,
    count,
    radius: 120 + ring * 90,
    angle,
    side: labelSide(angle),
    x: point.x,
    y: point.y,
    icon: empty,
    label: empty,
    ellipsis: false,
  };
}

describe("ring navigation", () => {
  const ring = [bare(0, 0, 0, 4), bare(1, 0, 1, 4), bare(2, 0, 2, 4), bare(3, 0, 3, 4)];

  it("walks clockwise and counter-clockwise, including a single ring's vertical keys", () => {
    expect(nextRingTile(0, ring, "ArrowRight")).toBe(1);
    expect(nextRingTile(3, ring, "ArrowRight")).toBe(0);
    expect(nextRingTile(0, ring, "ArrowLeft")).toBe(3);
    expect(nextRingTile(0, ring, "ArrowDown")).toBe(1);
    expect(nextRingTile(0, ring, "ArrowUp")).toBe(3);
    expect(nextRingTile(2, ring, "ArrowLeft")).toBe(1);
  });

  it("wraps Up and Down between rings", () => {
    const placed = [
      bare(0, 0, 0, 4),
      bare(1, 0, 1, 4),
      bare(2, 0, 2, 4),
      bare(3, 0, 3, 4),
      bare(4, 1, 0, 4),
      bare(5, 1, 1, 4),
      bare(6, 1, 2, 4),
      bare(7, 1, 3, 4),
    ];
    expect(nextRingTile(0, placed, "ArrowDown")).toBe(4);
    expect(nextRingTile(0, placed, "ArrowUp")).toBe(4);
    expect(nextRingTile(4, placed, "ArrowDown")).toBe(0);
    expect(nextRingTile(5, placed, "ArrowUp")).toBe(1);
    expect(nextRingTile(3, placed, "ArrowRight")).toBe(0);
    expect(nextRingTile(4, placed, "ArrowLeft")).toBe(7);
  });

  it("breaks an equal angle tie toward the earlier slot", () => {
    const placed = [bare(0, 0, 0, 4), bare(1, 0, 1, 4), bare(2, 0, 2, 4), bare(3, 0, 3, 4), bare(4, 1, 1, 8)];
    expect(placed[4]?.angle).toBeCloseTo(Math.PI / 4);
    expect(nextRingTile(4, placed, "ArrowUp")).toBe(0);
  });

  it("skips dimmed segments and wraps on the same ring", () => {
    const mask = [true, false, true, false];
    expect(nextRingTile(0, ring, "ArrowRight", mask)).toBe(2);
    expect(nextRingTile(2, ring, "ArrowRight", mask)).toBe(0);
    expect(nextRingTile(0, ring, "ArrowLeft", mask)).toBe(2);
    expect(nextRingTile(1, ring, "ArrowRight", mask)).toBe(2);
  });

  it("stays on the lit ring when the other ring is fully dimmed", () => {
    const placed = [bare(0, 0, 0, 2), bare(1, 0, 1, 2), bare(2, 1, 0, 2), bare(3, 1, 1, 2)];
    const innerOnly = [true, true, false, false];
    expect(nextRingTile(0, placed, "ArrowDown", innerOnly)).toBe(0);
    expect(nextRingTile(0, placed, "ArrowRight", innerOnly)).toBe(1);
  });

  it("returns no tile when the list is empty or fully dimmed", () => {
    expect(nextRingTile(0, [], "ArrowDown")).toBe(-1);
    expect(nextRingTile(-1, ring, "ArrowRight")).toBe(0);
    expect(nextRingTile(9, ring, "ArrowLeft")).toBe(0);
    expect(nextRingTile(0, ring, "ArrowRight", [false, false, false, false])).toBe(-1);
    expect(nextRingTile(-1, ring, "ArrowUp", [false, true, false, false])).toBe(1);
  });

  it("does not report a touching pair as an overlap", () => {
    expect(boxesOverlap({ left: 0, top: 0, right: 10, bottom: 10 }, { left: 10, top: 0, right: 20, bottom: 10 })).toBe(false);
    expect(boxesOverlap({ left: 0, top: 0, right: 10, bottom: 10 }, { left: 9, top: 0, right: 20, bottom: 10 })).toBe(true);
  });
});
