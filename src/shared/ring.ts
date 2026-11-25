import type { GridKey } from "./grid";

/**
 * Tiles sit on a clock face: slot 0 is at the top, and later slots run clockwise.
 * One ring holds up to this many labels before a second ring is used.
 */
export const ONE_RING_MAX = 8;

/**
 * A folder ring is kept when neither ring is more than this many past an even split.
 * Past that, the list is halved by order so one ring is not a wall of labels.
 */
export const KIND_SPLIT_SLACK = 2;

/** Radius of the inner ring, in units of the stage `--u` length. */
export const INNER_RADIUS = 1;

/** Outer ring, far enough out that inner labels clear the outer icons. */
export const OUTER_RADIUS = 2.02;

/** Single ring, between the two-ring radii so a short list still fills the HUD. */
export const SINGLE_RADIUS = 1.42;

export type LabelSide = "top" | "right" | "bottom" | "left";

export interface RingGroup<T> {
  ring: 0 | 1;
  radius: number;
  items: T[];
}

export interface RingPlacement {
  /** Index into the tile list passed to `placeTiles`. */
  index: number;
  ring: 0 | 1;
  slot: number;
  count: number;
  radius: number;
  /** Radians. 0 is 12 o'clock. Increases clockwise. */
  angle: number;
  side: LabelSide;
  /** Offset from the reactor center. y grows downward. */
  x: number;
  y: number;
}

export function segmentAngle(slot: number, count: number): number {
  if (count <= 0) return 0;
  const turn = Math.PI * 2;
  const wrapped = ((slot % count) + count) % count;
  return (turn * wrapped) / count;
}

export function segmentPoint(angle: number, radius: number): { x: number; y: number } {
  return {
    x: radius * Math.sin(angle),
    y: -radius * Math.cos(angle),
  };
}

function wrapAngle(angle: number): number {
  const turn = Math.PI * 2;
  let wrapped = angle % turn;
  if (wrapped < 0) wrapped += turn;
  if (wrapped > turn - 1e-9) return 0;
  return wrapped;
}

/** Side of the icon where the label stays upright and points away from the core. */
export function labelSide(angle: number): LabelSide {
  const wrapped = wrapAngle(angle);
  if (wrapped < Math.PI / 4 || wrapped >= (7 * Math.PI) / 4 - 1e-9) return "top";
  if (wrapped < (3 * Math.PI) / 4) return "right";
  if (wrapped < (5 * Math.PI) / 4) return "bottom";
  return "left";
}

function isFolder(tile: { kind: string }): boolean {
  return tile.kind === "folder";
}

/**
 * One ring while the labels fit. After that, folders take the outer ring when
 * both groups stay near an even split. A lopsided group is halved by order.
 */
export function splitIntoRings<T extends { kind: string }>(tiles: readonly T[]): RingGroup<T>[] {
  if (tiles.length === 0) return [];
  if (tiles.length <= ONE_RING_MAX) {
    return [{ ring: 0, radius: SINGLE_RADIUS, items: tiles.slice() }];
  }

  const folders = tiles.filter((tile) => isFolder(tile));
  const inner = tiles.filter((tile) => !isFolder(tile));
  const even = Math.ceil(tiles.length / 2);
  const limit = even + KIND_SPLIT_SLACK;
  if (inner.length > 0 && folders.length > 0 && inner.length <= limit && folders.length <= limit) {
    return [
      { ring: 0, radius: INNER_RADIUS, items: inner },
      { ring: 1, radius: OUTER_RADIUS, items: folders },
    ];
  }

  return [
    { ring: 0, radius: INNER_RADIUS, items: tiles.slice(0, even) },
    { ring: 1, radius: OUTER_RADIUS, items: tiles.slice(even) },
  ];
}

export function placeTiles<T extends { kind: string }>(tiles: readonly T[]): RingPlacement[] {
  const groups = splitIntoRings(tiles);
  const meta = new Map<T, { ring: 0 | 1; radius: number; slot: number; count: number }>();
  for (const group of groups) {
    group.items.forEach((tile, slot) => {
      meta.set(tile, { ring: group.ring, radius: group.radius, slot, count: group.items.length });
    });
  }

  return tiles.map((tile, index) => {
    const found = meta.get(tile);
    if (!found) throw new Error("missing ring placement");
    const angle = segmentAngle(found.slot, found.count);
    const point = segmentPoint(angle, found.radius);
    return {
      index,
      ring: found.ring,
      slot: found.slot,
      count: found.count,
      radius: found.radius,
      angle,
      side: labelSide(angle),
      x: point.x,
      y: point.y,
    };
  });
}

function circularDistance(a: number, b: number): number {
  const turn = Math.PI * 2;
  const delta = Math.abs(a - b) % turn;
  return delta > Math.PI ? turn - delta : delta;
}

/**
 * Left and Right walk the current ring, wrapping, and skip tiles that are not selectable.
 * Up and Down change rings, landing on the closest selectable angle.
 * A single ring treats Up as Left and Down as Right so every arrow still moves.
 * An index outside the list jumps to the first selectable tile. None selectable returns -1.
 */
export function nextRingTile(
  index: number,
  placements: readonly RingPlacement[],
  key: GridKey,
  selectable?: readonly boolean[],
): number {
  if (placements.length === 0) return -1;
  const on = (i: number) => !selectable || selectable[i] === true;
  const firstOn = (): number => {
    for (let i = 0; i < placements.length; i++) if (on(i)) return i;
    return -1;
  };
  if (!placements.some((_, i) => on(i))) return -1;
  if (index < 0 || index >= placements.length) return firstOn();

  const current = placements[index];
  const rings = [...new Set(placements.map((place) => place.ring))].sort((a, b) => a - b);
  const mates = placements
    .filter((place) => place.ring === current.ring)
    .slice()
    .sort((a, b) => a.slot - b.slot);

  const step = (direction: 1 | -1): number => {
    const start = mates.findIndex((place) => place.index === index);
    if (start < 0) return index;
    for (let n = 1; n <= mates.length; n++) {
      const mate = mates[(start + direction * n + mates.length) % mates.length];
      if (on(mate.index)) return mate.index;
    }
    return index;
  };

  const single = rings.length < 2;
  if (key === "ArrowRight" || (key === "ArrowDown" && single)) return step(1);
  if (key === "ArrowLeft" || (key === "ArrowUp" && single)) return step(-1);

  const ringPos = rings.indexOf(current.ring);
  const targetRing = key === "ArrowUp" ? rings[ringPos - 1] : rings[ringPos + 1];
  if (targetRing === undefined) return index;

  const candidates = placements.filter((place) => place.ring === targetRing && on(place.index));
  if (candidates.length === 0) return index;

  let best = candidates[0];
  let bestDist = Infinity;
  for (const candidate of candidates) {
    const dist = circularDistance(current.angle, candidate.angle);
    const closer = dist < bestDist - 1e-9;
    const tie = Math.abs(dist - bestDist) <= 1e-9 && candidate.slot < best.slot;
    if (closer || tie) {
      best = candidate;
      bestDist = dist;
    }
  }
  return best.index;
}
