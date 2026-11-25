import { describe, expect, it } from "vitest";
import {
  INNER_RADIUS,
  KIND_SPLIT_SLACK,
  ONE_RING_MAX,
  OUTER_RADIUS,
  SINGLE_RADIUS,
  labelSide,
  nextRingTile,
  placeTiles,
  segmentAngle,
  segmentPoint,
  splitIntoRings,
  type RingPlacement,
} from "../src/shared/ring";

interface Sample {
  id: string;
  kind: "app" | "folder" | "system";
}

function tile(id: string, kind: Sample["kind"] = "app"): Sample {
  return { id, kind };
}

function apps(count: number, kind: Sample["kind"] = "app"): Sample[] {
  return Array.from({ length: count }, (_, index) => tile(`${kind}-${index}`, kind));
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

describe("ring splitting", () => {
  it("keeps a short list on one ring in input order", () => {
    expect(ONE_RING_MAX).toBe(8);
    const tiles = [
      tile("edge", "app"),
      tile("explorer", "system"),
      tile("desktop", "folder"),
      tile("documents", "folder"),
    ];
    const groups = splitIntoRings(tiles);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.ring).toBe(0);
    expect(groups[0]?.radius).toBe(SINGLE_RADIUS);
    expect(groups[0]?.items.map((item) => item.id)).toEqual(["edge", "explorer", "desktop", "documents"]);

    const atLimit = apps(ONE_RING_MAX);
    expect(splitIntoRings(atLimit)).toHaveLength(1);
    expect(splitIntoRings([])).toEqual([]);
  });

  it("puts folders on the outer ring when both rings stay readable", () => {
    expect(KIND_SPLIT_SLACK).toBe(2);
    const tiles = [
      tile("folder-a", "folder"),
      tile("chatgpt"),
      tile("folder-b", "folder"),
      tile("claude"),
      tile("folder-c", "folder"),
      tile("cursor"),
      tile("folder-d", "folder"),
      tile("explorer", "system"),
      tile("edge"),
    ];
    expect(tiles.length).toBe(ONE_RING_MAX + 1);
    const groups = splitIntoRings(tiles);
    expect(groups.map((group) => group.ring)).toEqual([0, 1]);
    expect(groups[0]?.radius).toBe(INNER_RADIUS);
    expect(groups[1]?.radius).toBe(OUTER_RADIUS);
    expect(groups[0]?.items.map((item) => item.id)).toEqual(["chatgpt", "claude", "cursor", "explorer", "edge"]);
    expect(groups[1]?.items.map((item) => item.id)).toEqual(["folder-a", "folder-b", "folder-c", "folder-d"]);
  });

  it("halves a lopsided list by order instead of crowding one ring", () => {
    const tiles = [...apps(11), tile("only-folder", "folder")];
    const even = Math.ceil(tiles.length / 2);
    expect(11).toBeGreaterThan(even + KIND_SPLIT_SLACK);
    const groups = splitIntoRings(tiles);
    expect(groups[0]?.items.map((item) => item.id)).toEqual(tiles.slice(0, even).map((item) => item.id));
    expect(groups[1]?.items.map((item) => item.id)).toEqual(tiles.slice(even).map((item) => item.id));
    expect(groups[1]?.items.some((item) => item.kind !== "folder")).toBe(true);
  });

  it("splits a long list that is only folders or only apps", () => {
    const onlyApps = apps(ONE_RING_MAX + 1);
    const groups = splitIntoRings(onlyApps);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.items).toHaveLength(Math.ceil(onlyApps.length / 2));
    expect(groups[1]?.radius).toBe(OUTER_RADIUS);

    const onlyFolders = apps(10, "folder");
    const folderGroups = splitIntoRings(onlyFolders);
    expect(folderGroups[0]?.items.every((item) => item.kind === "folder")).toBe(true);
    expect(folderGroups[0]?.items).toHaveLength(5);
    expect(folderGroups[1]?.items).toHaveLength(5);
  });

  it("places every tile once, on its ring, at the clock position", () => {
    const tiles = [...apps(6), ...apps(4, "folder").map((item, index) => tile(`folder-${index}`, "folder"))];
    const placed = placeTiles(tiles);
    expect(placed.map((place) => place.index)).toEqual(tiles.map((_, index) => index));
    expect(new Set(placed.map((place) => place.index)).size).toBe(tiles.length);

    const inner = placed.filter((place) => place.ring === 0);
    const outer = placed.filter((place) => place.ring === 1);
    expect(inner).toHaveLength(6);
    expect(outer).toHaveLength(4);
    expect(inner.map((place) => place.slot)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(outer.map((place) => place.slot)).toEqual([0, 1, 2, 3]);

    const innerTop = inner[0];
    const outerTop = outer[0];
    expect(innerTop?.angle).toBeCloseTo(0);
    expect(outerTop?.angle).toBeCloseTo(0);
    expect(innerTop?.x).toBeCloseTo(0);
    expect(innerTop?.y).toBeCloseTo(-INNER_RADIUS);
    expect(outerTop?.y).toBeLessThan(innerTop?.y ?? 0);
    expect(inner[1]?.x).toBeGreaterThan(0);
    expect(inner[1]?.side).toBe("right");

    for (let slot = 0; slot < inner.length; slot++) {
      const next = inner[(slot + 1) % inner.length];
      const current = inner[slot];
      if (!next || !current) continue;
      const distance = Math.hypot(next.x - current.x, next.y - current.y);
      expect(distance).toBeGreaterThan(0.9);
    }
  });

  it("uses the single-ring radius and cardinal label sides for four tiles", () => {
    const placed = placeTiles(apps(4));
    expect(placed.every((place) => place.radius === SINGLE_RADIUS && place.ring === 0)).toBe(true);
    expect(placed.map((place) => place.side)).toEqual(["top", "right", "bottom", "left"]);
    expect(placed[0]?.y).toBeCloseTo(-SINGLE_RADIUS);
    expect(placed[1]?.x).toBeCloseTo(SINGLE_RADIUS);
    expect(placed[2]?.y).toBeCloseTo(SINGLE_RADIUS);
    expect(placed[3]?.x).toBeCloseTo(-SINGLE_RADIUS);
  });

  it("puts a single tile at the top", () => {
    const placed = placeTiles([tile("edge")]);
    expect(placed[0]?.angle).toBeCloseTo(0);
    expect(placed[0]?.x).toBeCloseTo(0);
    expect(placed[0]?.y).toBeCloseTo(-SINGLE_RADIUS);
    expect(placed[0]?.side).toBe("top");
    expect(placed[0]?.count).toBe(1);
  });
});

function node(index: number, ring: 0 | 1, slot: number, count: number, radius = 1): RingPlacement {
  const angle = segmentAngle(slot, count);
  const point = segmentPoint(angle, radius);
  return {
    index,
    ring,
    slot,
    count,
    radius,
    angle,
    side: labelSide(angle),
    x: point.x,
    y: point.y,
  };
}

describe("ring navigation", () => {
  const ring = [node(0, 0, 0, 4), node(1, 0, 1, 4), node(2, 0, 2, 4), node(3, 0, 3, 4)];

  it("walks clockwise and counter-clockwise, including a single ring's vertical keys", () => {
    expect(nextRingTile(0, ring, "ArrowRight")).toBe(1);
    expect(nextRingTile(3, ring, "ArrowRight")).toBe(0);
    expect(nextRingTile(0, ring, "ArrowLeft")).toBe(3);
    expect(nextRingTile(0, ring, "ArrowDown")).toBe(1);
    expect(nextRingTile(0, ring, "ArrowUp")).toBe(3);
    expect(nextRingTile(2, ring, "ArrowLeft")).toBe(1);

    let index = 0;
    const seen = [0];
    for (let step = 0; step < 3; step++) {
      index = nextRingTile(index, ring, "ArrowRight");
      seen.push(index);
    }
    expect(seen).toEqual([0, 1, 2, 3]);
  });

  it("moves between rings by angle and stays at the inner or outer edge", () => {
    const placed = [
      node(0, 0, 0, 4, INNER_RADIUS),
      node(1, 0, 1, 4, INNER_RADIUS),
      node(2, 0, 2, 4, INNER_RADIUS),
      node(3, 0, 3, 4, INNER_RADIUS),
      node(4, 1, 0, 4, OUTER_RADIUS),
      node(5, 1, 1, 4, OUTER_RADIUS),
      node(6, 1, 2, 4, OUTER_RADIUS),
      node(7, 1, 3, 4, OUTER_RADIUS),
    ];
    expect(nextRingTile(0, placed, "ArrowDown")).toBe(4);
    expect(nextRingTile(5, placed, "ArrowUp")).toBe(1);
    expect(nextRingTile(0, placed, "ArrowUp")).toBe(0);
    expect(nextRingTile(4, placed, "ArrowDown")).toBe(4);
    expect(nextRingTile(3, placed, "ArrowRight")).toBe(0);
    expect(nextRingTile(4, placed, "ArrowLeft")).toBe(7);
  });

  it("breaks an equal angle tie toward the earlier slot", () => {
    const placed = [
      node(0, 0, 0, 4),
      node(1, 0, 1, 4),
      node(2, 0, 2, 4),
      node(3, 0, 3, 4),
      node(4, 1, 1, 8, OUTER_RADIUS),
    ];
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

  it("stays put when the other ring has nothing selectable", () => {
    const placed = placeTiles([
      tile("edge"),
      tile("explorer", "system"),
      tile("desktop", "folder"),
      tile("documents", "folder"),
      tile("downloads", "folder"),
      tile("pictures", "folder"),
      tile("chatgpt"),
      tile("claude"),
      tile("projects", "folder"),
    ]);
    expect(new Set(placed.map((place) => place.ring)).size).toBe(2);
    const inner = placed.filter((place) => place.ring === 0).map((place) => place.index);
    const outerOff = placed.map((place) => place.ring === 0);
    expect(nextRingTile(inner[0] ?? 0, placed, "ArrowDown", outerOff)).toBe(inner[0]);
    expect(nextRingTile(inner[0] ?? 0, placed, "ArrowRight", outerOff)).toBe(inner[1]);
  });

  it("follows the inner ring in slot order when folders sit outside", () => {
    const tiles = [
      tile("folder-a", "folder"),
      tile("chatgpt"),
      tile("folder-b", "folder"),
      tile("claude"),
      tile("folder-c", "folder"),
      tile("cursor"),
      tile("folder-d", "folder"),
      tile("explorer", "system"),
      tile("edge"),
    ];
    const placed = placeTiles(tiles);
    expect(nextRingTile(1, placed, "ArrowRight")).toBe(3);
    expect(nextRingTile(1, placed, "ArrowDown")).toBe(0);
    expect(nextRingTile(0, placed, "ArrowUp")).toBe(1);
    expect(nextRingTile(8, placed, "ArrowRight")).toBe(1);
  });

  it("returns no tile when the list is empty or fully dimmed", () => {
    expect(nextRingTile(0, [], "ArrowDown")).toBe(-1);
    expect(nextRingTile(-1, ring, "ArrowRight")).toBe(0);
    expect(nextRingTile(9, ring, "ArrowLeft")).toBe(0);
    expect(nextRingTile(0, ring, "ArrowRight", [false, false, false, false])).toBe(-1);
    expect(nextRingTile(-1, ring, "ArrowUp", [false, true, false, false])).toBe(1);
  });
});
