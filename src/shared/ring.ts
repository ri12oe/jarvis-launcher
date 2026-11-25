import type { GridKey } from "./grid";

/** Icon ring diameter, in CSS pixels. Matches `.icon-ring`. */
export const ICON_SIZE = 44;

/** Gap between an icon and its label. Matches the tile flex gap. */
export const LABEL_GAP = 8;

/** 11rem at a 16px root. Labels ellipsize past this. */
export const LABEL_MAX_WIDTH = 176;

export const LABEL_FONT = 12;
export const LABEL_TRACKING_EM = 0.12;

/**
 * Advance width of one monospace glyph at 12px, a little wider than DejaVu
 * so the layout leaves air if the real font is heavier.
 */
export const LABEL_CHAR_WIDTH = 7.8;

export const LABEL_LINE = 18;

/** Clearance the overlap check demands between two boxes. */
export const BOX_PAD = 3;

/** How much of the window height the ring should fill when the tiles fit. */
export const HUD_FILL = 0.875;

export const MAX_RINGS = 3;

/** Icon centers stay outside the reactor and the page controls. */
const MIN_INNER = 136;

interface Fit {
  icon: number;
  gap: number;
  minInner: number;
  labelMax: number;
  labelLine: number;
  font: number;
  charWidth: number;
  /** How many page numbers to reserve under the reactor while placing this ring. */
  readoutPages: number;
}

const FULL_FIT: Fit = {
  icon: ICON_SIZE,
  gap: LABEL_GAP,
  minInner: MIN_INNER,
  labelMax: LABEL_MAX_WIDTH,
  labelLine: LABEL_LINE,
  font: LABEL_FONT,
  charWidth: LABEL_CHAR_WIDTH,
  readoutPages: 0,
};

/**
 * Smaller ring used only when every full page has fallen to one tile.
 * The inner radius stays past the page arrows. Those arrows reach about
 * reactor/2 + 46px, so a 48px radius puts icons underneath them.
 */
const COMPACT_FITS: readonly Fit[] = [
  { icon: 36, gap: 6, minInner: 104, labelMax: 128, labelLine: 16, font: 11, charWidth: 6.6, readoutPages: 0 },
  { icon: 32, gap: 4, minInner: 96, labelMax: 104, labelLine: 14, font: 10, charWidth: 5.6, readoutPages: 0 },
  { icon: 28, gap: 4, minInner: 88, labelMax: 84, labelLine: 13, font: 9, charWidth: 4.8, readoutPages: 0 },
];

const FOOTER_BLOCK = 72;

/** Matches `.subtitle` max-height. The panel scrolls past this. */
export const SUBTITLE_MAX = 72;

/** Gap between the ring stage and the subtitle panel. Matches the subtitle margin. */
export const SUBTITLE_GAP = 8;

/** Height taken from the window while the subtitle panel is visible. */
export function subtitleReserve(): number {
  return SUBTITLE_MAX + SUBTITLE_GAP;
}

/** Ring layout height while the subtitle panel is on screen. */
export function viewportAboveSubtitle(viewport: Viewport): Viewport {
  return { width: viewport.width, height: Math.max(240, viewport.height - subtitleReserve()) };
}

/**
 * The voice subtitle, in window coordinates. It is centered under the ring
 * and above the footer. `viewport` is the full window.
 */
export function subtitlePanelBox(viewport: Viewport): Aabb {
  const layout = viewportAboveSubtitle(viewport);
  const stageH = Math.max(160, layout.height - FOOTER_BLOCK);
  const width = Math.min(760, Math.max(160, viewport.width - 48));
  const left = (viewport.width - width) / 2;
  const top = stageH + SUBTITLE_GAP;
  return { left, top, right: left + width, bottom: top + SUBTITLE_MAX };
}

/** Icon and label boxes for every placed tile, in the same window coordinates as the subtitle. */
export function placedTileBoxes(layout: HudLayout, layoutViewport: Viewport): Aabb[] {
  const stageH = Math.max(160, layoutViewport.height - FOOTER_BLOCK);
  const cx = layoutViewport.width / 2;
  const cy = stageH / 2;
  const boxes: Aabb[] = [];
  for (const segment of layout.segments) {
    boxes.push(shiftBox(segment.icon, cx, cy), shiftBox(segment.label, cx, cy));
  }
  return boxes;
}

function shiftBox(box: Aabb, dx: number, dy: number): Aabb {
  return { left: box.left + dx, top: box.top + dy, right: box.right + dx, bottom: box.bottom + dy };
}
const SEARCH_STEPS = 22;

export type LabelSide = "top" | "right" | "bottom" | "left";

export interface LabelMetrics {
  width: number;
  height: number;
  ellipsis: boolean;
}

export interface Aabb {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface RingPlacement {
  /** Index into the tile list passed to `layoutHud`. */
  index: number;
  page: number;
  ring: number;
  slot: number;
  count: number;
  /** Icon-center radius in CSS pixels. */
  radius: number;
  /** Radians. 0 is 12 o'clock. Increases clockwise. */
  angle: number;
  side: LabelSide;
  /** Icon center relative to the stage center. y grows downward. */
  x: number;
  y: number;
  icon: Aabb;
  label: Aabb;
  ellipsis: boolean;
}

export interface HudLayout {
  segments: RingPlacement[];
  pageCount: number;
  /** Reactor diameter in CSS pixels, one entry per page. */
  reactor: number[];
  /** Icon ring diameter. The stage uses this so the drawn tiles match the boxes. */
  icon: number;
  gap: number;
  labelFont: number;
  labelLine: number;
  labelMax: number;
}

/** Pure fallback used when canvas measurement is unavailable, including unit tests. */
export function measureLabel(text: string): LabelMetrics {
  return metricsFromAdvance(text, () => LABEL_CHAR_WIDTH);
}

/** Shared cap and tracking. `advance` is the width of one uppercase glyph. */
export function metricsFromAdvance(text: string, advance: (char: string) => number): LabelMetrics {
  const chars = [...text.toUpperCase()];
  const count = Math.max(1, chars.length);
  const tracking = LABEL_FONT * LABEL_TRACKING_EM;
  let raw = 0;
  if (chars.length === 0) raw = advance(" ");
  else for (const char of chars) raw += advance(char);
  raw += Math.max(0, count - 1) * tracking;
  return {
    width: Math.min(raw, LABEL_MAX_WIDTH),
    height: LABEL_LINE,
    ellipsis: raw > LABEL_MAX_WIDTH + 0.5,
  };
}

export type LabelMeasurer = (text: string) => LabelMetrics;

/**
 * Minimum center-to-center distance along the ring for one segment.
 * The label width is the tangential span when the label sits across the arc,
 * and the icon is the span when the label points outward.
 */
export function minArcSpacing(metrics: LabelMetrics, sizing: Fit = FULL_FIT): number {
  return Math.max(sizing.icon, metrics.width) + sizing.gap;
}

export function radiusForArcSpacing(count: number, spacing: number): number {
  if (count <= 1) return 0;
  const theta = (2 * Math.PI) / count;
  return spacing / (2 * Math.sin(theta / 2));
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

export function boxesOverlap(a: Aabb, b: Aabb, pad = 0): boolean {
  return a.left < b.right + pad && a.right + pad > b.left && a.top < b.bottom + pad && a.bottom + pad > b.top;
}

function boxesAt(
  x: number,
  y: number,
  side: LabelSide,
  metrics: LabelMetrics,
  sizing: Fit,
): { icon: Aabb; label: Aabb } {
  const half = sizing.icon / 2;
  const icon: Aabb = { left: x - half, top: y - half, right: x + half, bottom: y + half };
  const label: Aabb = { left: 0, top: 0, right: 0, bottom: 0 };
  if (side === "right") {
    label.left = icon.right + sizing.gap;
    label.right = label.left + metrics.width;
    label.top = y - metrics.height / 2;
    label.bottom = y + metrics.height / 2;
  } else if (side === "left") {
    label.right = icon.left - sizing.gap;
    label.left = label.right - metrics.width;
    label.top = y - metrics.height / 2;
    label.bottom = y + metrics.height / 2;
  } else if (side === "bottom") {
    label.left = x - metrics.width / 2;
    label.right = x + metrics.width / 2;
    label.top = icon.bottom + sizing.gap;
    label.bottom = label.top + metrics.height;
  } else {
    label.left = x - metrics.width / 2;
    label.right = x + metrics.width / 2;
    label.bottom = icon.top - sizing.gap;
    label.top = label.bottom - metrics.height;
  }
  return { icon, label };
}

/**
 * Page arrows and the page numbers, in stage-center coordinates.
 * Matches `.arc-prev`, `.arc-next`, and `.page-readout`.
 * Arrows are 36×28 and sit reactor/2 + 10px to reactor/2 + 46px from center.
 */
export function pageControlBoxes(reactor: number, pageCount: number): Aabb[] {
  if (pageCount < 2) return [];
  const half = reactor / 2;
  const prev: Aabb = { left: -(half + 46), right: -(half + 10), top: -14, bottom: 14 };
  const next: Aabb = { left: half + 10, right: half + 46, top: -14, bottom: 14 };
  const mark = 26;
  const width = Math.max(mark, pageCount * mark);
  const top = half + 8;
  const readout: Aabb = { left: -width / 2, right: width / 2, top, bottom: top + 16 };
  return [prev, next, readout];
}

function allowedBounds(viewport: Viewport): Aabb {
  const stageH = Math.max(160, viewport.height - FOOTER_BLOCK);
  const halfH = Math.min(stageH / 2 - 10, (viewport.height * HUD_FILL) / 2);
  const halfW = viewport.width / 2 - 18;
  return { left: -halfW, top: -halfH, right: halfW, bottom: halfH };
}

/** Top-left clock panel, in stage-center coordinates, so labels do not run through it. */
function clockObstacle(viewport: Viewport): Aabb {
  const stageH = Math.max(160, viewport.height - FOOTER_BLOCK);
  const cx = viewport.width / 2;
  const cy = stageH / 2;
  return { left: 16 - cx, right: 284 - cx, top: 16 - cy, bottom: 140 - cy };
}

function ringSegments(
  items: readonly LabelMetrics[],
  radius: number,
  sizing: Fit,
): Array<{ icon: Aabb; label: Aabb }> {
  return items.map((metrics, slot) => {
    const angle = segmentAngle(slot, items.length);
    const point = segmentPoint(angle, radius);
    return boxesAt(point.x, point.y, labelSide(angle), metrics, sizing);
  });
}

function segmentsCollide(segments: ReadonlyArray<{ icon: Aabb; label: Aabb }>, pad = BOX_PAD): boolean {
  const boxes: Aabb[] = [];
  for (const segment of segments) boxes.push(segment.icon, segment.label);
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if ((i ^ 1) === j && (i % 2 === 0)) continue;
      if (boxesOverlap(boxes[i], boxes[j], pad)) return true;
    }
  }
  return false;
}

function radiusFromPairs(items: readonly LabelMetrics[], sizing: Fit): number {
  if (items.length <= 1) return sizing.minInner;
  let radius = 0;
  for (let i = 0; i < items.length; i++) {
    const span = (minArcSpacing(items[i], sizing) + minArcSpacing(items[(i + 1) % items.length], sizing)) / 2;
    radius = Math.max(radius, radiusForArcSpacing(items.length, span));
  }
  return radius;
}

function ringClear(items: readonly LabelMetrics[], radius: number, sizing: Fit): boolean {
  return !segmentsCollide(ringSegments(items, radius, sizing));
}

/** Smallest icon radius whose boxes clear each other, seeded by the arc spacing. */
function minimumRadius(items: readonly LabelMetrics[], sizing: Fit): number {
  if (items.length === 0) return sizing.minInner;
  const hinted = Math.max(sizing.minInner, radiusFromPairs(items, sizing));
  let lo = sizing.minInner;
  let hi = hinted;
  if (!ringClear(items, hi, sizing)) {
    lo = hi;
    hi = Math.max(hi * 2, lo + 200);
    while (!ringClear(items, hi, sizing) && hi < 8000) hi *= 2;
    if (!ringClear(items, hi, sizing)) return Number.POSITIVE_INFINITY;
  }
  for (let step = 0; step < SEARCH_STEPS; step++) {
    const mid = (lo + hi) / 2;
    if (ringClear(items, mid, sizing)) hi = mid;
    else lo = mid;
  }
  return Math.max(hi, items.length > 1 ? 0 : sizing.minInner);
}

function furthest(segments: ReadonlyArray<{ icon: Aabb; label: Aabb }>): number {
  let max = 0;
  for (const segment of segments) {
    for (const box of [segment.icon, segment.label]) {
      const corners = [
        [box.left, box.top],
        [box.right, box.top],
        [box.right, box.bottom],
        [box.left, box.bottom],
      ];
      for (const [x, y] of corners) max = Math.max(max, Math.hypot(x, y));
    }
  }
  return max;
}

function inside(box: Aabb, bounds: Aabb): boolean {
  return box.left >= bounds.left - 0.5 && box.right <= bounds.right + 0.5 && box.top >= bounds.top - 0.5 && box.bottom <= bounds.bottom + 0.5;
}

function layoutFits(
  segments: ReadonlyArray<{ icon: Aabb; label: Aabb }>,
  bounds: Aabb,
  obstacles: readonly Aabb[],
): boolean {
  if (segmentsCollide(segments)) return false;
  for (const segment of segments) {
    if (!inside(segment.icon, bounds) || !inside(segment.label, bounds)) return false;
    for (const obstacle of obstacles) {
      if (boxesOverlap(segment.icon, obstacle, 4) || boxesOverlap(segment.label, obstacle, 4)) return false;
    }
  }
  return true;
}

interface Built {
  radii: number[];
  groups: LabelMetrics[][];
  reach: number;
}

function splits(count: number, rings: number): number[][] {
  if (rings <= 1 || count <= 1) return [[count]];
  const out: number[][] = [];
  if (rings === 2) {
    for (let inner = 1; inner <= Math.floor(count / 2); inner++) out.push([inner, count - inner]);
    return out;
  }
  for (let inner = 1; inner <= Math.floor(count / 3); inner++) {
    const rest = count - inner;
    for (let middle = inner; middle <= Math.floor(rest / 2); middle++) {
      const outer = rest - middle;
      if (outer >= middle) out.push([inner, middle, outer]);
    }
  }
  return out;
}

function sliceGroups(items: readonly LabelMetrics[], counts: readonly number[]): LabelMetrics[][] {
  const groups: LabelMetrics[][] = [];
  let cursor = 0;
  for (const count of counts) {
    groups.push(items.slice(cursor, cursor + count));
    cursor += count;
  }
  return groups;
}

function buildAt(
  groups: readonly LabelMetrics[][],
  radii: readonly number[],
  sizing: Fit,
): Array<{ icon: Aabb; label: Aabb }> {
  const out: Array<{ icon: Aabb; label: Aabb }> = [];
  groups.forEach((group, ring) => {
    group.forEach((metrics, slot) => {
      const point = segmentPoint(segmentAngle(slot, group.length), radii[ring]);
      out.push(boxesAt(point.x, point.y, labelSide(segmentAngle(slot, group.length)), metrics, sizing));
    });
  });
  return out;
}

function reachOf(segments: ReadonlyArray<{ icon: Aabb; label: Aabb }>): number {
  let top = Infinity;
  let bottom = -Infinity;
  for (const segment of segments) {
    for (const box of [segment.icon, segment.label]) {
      top = Math.min(top, box.top);
      bottom = Math.max(bottom, box.bottom);
    }
  }
  return bottom - top;
}

function tryCounts(
  items: readonly LabelMetrics[],
  counts: readonly number[],
  bounds: Aabb,
  obstacles: readonly Aabb[],
  sizing: Fit,
): Built | null {
  const groups = sliceGroups(items, counts);
  const radii = groups.map((group, ring) => {
    const min = minimumRadius(group, sizing);
    if (!Number.isFinite(min)) return Number.POSITIVE_INFINITY;
    return ring === 0 ? Math.max(min, sizing.minInner) : min;
  });
  if (radii.some((radius) => !Number.isFinite(radius))) return null;

  for (let ring = 1; ring < radii.length; ring++) {
    const prev = ringSegments(groups[ring - 1], radii[ring - 1], sizing);
    radii[ring] = Math.max(radii[ring], furthest(prev) + sizing.gap + sizing.icon / 2);
  }

  const blocked = (inner: number) => [...obstacles, ...pageControlBoxes(reactorFromRadius(inner), sizing.readoutPages)];
  const minimum = buildAt(groups, radii, sizing);
  if (!layoutFits(minimum, bounds, blocked(radii[0]))) return null;

  let lo = 0;
  let hi = 4000;
  let best = 0;
  for (let step = 0; step < SEARCH_STEPS; step++) {
    const mid = (lo + hi) / 2;
    const grown = buildAt(groups, radii.map((radius) => radius + mid), sizing);
    if (layoutFits(grown, bounds, blocked(radii[0] + mid))) {
      best = mid;
      lo = mid;
    } else hi = mid;
  }

  const finalRadii = radii.map((radius) => radius + best);
  const finalSegments = buildAt(groups, finalRadii, sizing);
  if (!layoutFits(finalSegments, bounds, blocked(finalRadii[0]))) return null;
  return { radii: finalRadii, groups, reach: reachOf(finalSegments) };
}

/**
 * One tile on its own page, inside `bounds`.
 * A full ring at the usual inner radius can stick out of a short window.
 * Shrinking the radius, then ignoring the clock, still beats drawing it off screen.
 */
function placeOneInside(metrics: LabelMetrics, bounds: Aabb, obstacles: readonly Aabb[], sizing: Fit): Built {
  const withClock = placeSlice([metrics], bounds, obstacles, sizing);
  if (withClock) return withClock;
  const clear = placeSlice([metrics], bounds, [], sizing);
  if (clear) return clear;
  let best: Built | null = null;
  for (let radius = sizing.minInner; radius >= 0; radius -= 2) {
    const controls = pageControlBoxes(reactorFromRadius(radius), sizing.readoutPages);
    const segments = buildAt([[metrics]], [radius], sizing);
    if (!layoutFits(segments, bounds, controls)) continue;
    best = { radii: [radius], groups: [[metrics]], reach: reachOf(segments) };
    break;
  }
  if (best) return best;
  return { radii: [sizing.minInner], groups: [[metrics]], reach: 0 };
}

function placeSlice(
  items: readonly LabelMetrics[],
  bounds: Aabb,
  obstacles: readonly Aabb[],
  sizing: Fit,
): Built | null {
  let best: Built | null = null;
  const ringLimit = Math.min(MAX_RINGS, items.length);
  for (let rings = 1; rings <= ringLimit; rings++) {
    for (const counts of splits(items.length, rings)) {
      const built = tryCounts(items, counts, bounds, obstacles, sizing);
      if (!built) continue;
      if (!best || built.reach > best.reach + 0.5) best = built;
    }
    if (best) return best;
  }
  return null;
}

function materialize(built: Built, page: number, indexBase: number, sizing: Fit): RingPlacement[] {
  const placed: RingPlacement[] = [];
  let offset = 0;
  built.groups.forEach((group, ring) => {
    group.forEach((metrics, slot) => {
      const angle = segmentAngle(slot, group.length);
      const point = segmentPoint(angle, built.radii[ring]);
      const side = labelSide(angle);
      const boxes = boxesAt(point.x, point.y, side, metrics, sizing);
      placed.push({
        index: indexBase + offset,
        page,
        ring,
        slot,
        count: group.length,
        radius: built.radii[ring],
        angle,
        side,
        x: point.x,
        y: point.y,
        icon: boxes.icon,
        label: boxes.label,
        ellipsis: metrics.ellipsis,
      });
      offset += 1;
    });
  });
  return placed;
}

/** Reactor diameter from the innermost icon radius. The seed is +Infinity so a real radius wins. */
export function reactorDiameter(segments: readonly RingPlacement[]): number {
  const inner = segments.reduce((min, segment) => Math.min(min, segment.radius), Number.POSITIVE_INFINITY);
  return reactorFromRadius(inner);
}

function reactorFromRadius(inner: number): number {
  if (!Number.isFinite(inner)) return 96;
  const raw = Math.min(inner * 0.7, inner - 88);
  if (raw >= 72) return Math.min(raw, 480);
  // A reduced ring is smaller than the usual core. Keep the core inside the icons.
  return Math.max(36, Math.min(inner * 0.5, Math.max(0, inner - 24)));
}

/**
 * Places every tile on up to three rings. Radii come from the label width and
 * the icon, then grow until the ring fills the stage. Tiles that still do not
 * fit move to the next page, in order.
 */
export function layoutHud<T extends { label: string }>(
  tiles: readonly T[],
  viewport: Viewport,
  measure: LabelMeasurer = measureLabel,
): HudLayout {
  if (viewport.width < 320 || viewport.height < 240) {
    return layoutHud(tiles, { width: Math.max(viewport.width, 1366), height: Math.max(viewport.height, 768) }, measure);
  }
  const measured = tiles.map((tile) => measure(tile.label));
  const full = layoutFitted(measured, viewport, FULL_FIT);
  // Shrink only after the full size has already fallen to one tile per page.
  // A short last page does not count. A window that still holds a real ring
  // keeps its labels and reactor.
  if (full.pageCount <= 1 || minTilesOnPage(full) > 1) return full;
  let best = full;
  for (const candidate of COMPACT_FITS) {
    const next = layoutFitted(scaleMetrics(measured, candidate), viewport, candidate);
    if (next.pageCount < best.pageCount) best = next;
  }
  return best;
}

/** Fewest tiles on a page, ignoring a short last page. */
function minTilesOnPage(layout: HudLayout): number {
  if (layout.pageCount <= 1) return layout.segments.length;
  const counts = Array.from({ length: layout.pageCount - 1 }, () => 0);
  for (const segment of layout.segments) {
    if (segment.page < counts.length) counts[segment.page] += 1;
  }
  return Math.min(...counts);
}

function controlsOverlap(layout: HudLayout): boolean {
  if (layout.pageCount < 2) return false;
  for (let page = 0; page < layout.pageCount; page++) {
    const controls = pageControlBoxes(layout.reactor[page] ?? 96, layout.pageCount);
    for (const segment of layout.segments) {
      if (segment.page !== page) continue;
      for (const control of controls) {
        if (boxesOverlap(segment.icon, control) || boxesOverlap(segment.label, control)) return true;
      }
    }
  }
  return false;
}

function scaleMetrics(metrics: readonly LabelMetrics[], next: Fit): LabelMetrics[] {
  const ratio = next.font / FULL_FIT.font;
  return metrics.map((metric) => {
    const raw = metric.width * ratio;
    return {
      width: Math.min(raw, next.labelMax),
      height: next.labelLine,
      ellipsis: raw > next.labelMax + 0.5,
    };
  });
}

function layoutFitted(metrics: readonly LabelMetrics[], viewport: Viewport, sizing: Fit): HudLayout {
  let layout = layoutAt(metrics, viewport, { ...sizing, readoutPages: 0 });
  // Reserve the arrows and the page numbers only after a layout actually hits them,
  // so a ring that already clears the controls keeps the same pages.
  for (let pass = 0; pass < 3 && controlsOverlap(layout); pass++) {
    const reserved = layoutAt(metrics, viewport, { ...sizing, readoutPages: layout.pageCount });
    if (reserved.pageCount === layout.pageCount && !controlsOverlap(reserved)) return reserved;
    layout = reserved;
  }
  return layout;
}

function layoutAt(metrics: readonly LabelMetrics[], viewport: Viewport, sizing: Fit): HudLayout {
  const bounds = allowedBounds(viewport);
  const obstacles = [clockObstacle(viewport)];
  const pages: RingPlacement[][] = [];
  let start = 0;
  while (start < metrics.length) {
    let best = 1;
    let lo = 1;
    let hi = metrics.length - start;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const placed = placeSlice(metrics.slice(start, start + mid), bounds, obstacles, sizing);
      if (placed) {
        best = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    const placed = placeSlice(metrics.slice(start, start + best), bounds, obstacles, sizing);
    if (!placed) {
      // One tile did not fit the grown ring. Keep it inside the stage instead of
      // laying it out in an unbounded box, which pushes the reactor and the tile off screen.
      pages.push(materialize(placeOneInside(metrics[start], bounds, obstacles, sizing), pages.length, start, sizing));
      start += 1;
      continue;
    }
    pages.push(materialize(placed, pages.length, start, sizing));
    start += best;
  }
  return {
    segments: pages.flat(),
    pageCount: Math.max(1, pages.length),
    reactor: (pages.length > 0 ? pages : [[]]).map((page) => reactorDiameter(page)),
    icon: sizing.icon,
    gap: sizing.gap,
    labelFont: sizing.font,
    labelLine: sizing.labelLine,
    labelMax: sizing.labelMax,
  };
}

function circularDistance(a: number, b: number): number {
  const turn = Math.PI * 2;
  const delta = Math.abs(a - b) % turn;
  return delta > Math.PI ? turn - delta : delta;
}

/**
 * Left and Right walk the current ring and wrap.
 * Up and Down move to the nearest selectable segment on the next ring and wrap
 * from the inner ring to the outer ring. A single ring treats Up as Left and
 * Down as Right. An index that is not on this page jumps to the first selectable
 * segment. None selectable returns -1.
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
    for (const place of placements) if (on(place.index)) return place.index;
    return -1;
  };
  if (!placements.some((place) => on(place.index))) return -1;
  const current = placements.find((place) => place.index === index);
  if (!current) return firstOn();

  const rings = [...new Set(placements.map((place) => place.ring))].sort((a, b) => a - b);
  const mates = placements.filter((place) => place.ring === current.ring).slice().sort((a, b) => a.slot - b.slot);

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

  const direction = key === "ArrowUp" ? -1 : 1;
  const ringPos = Math.max(0, rings.indexOf(current.ring));
  for (let n = 1; n <= rings.length; n++) {
    const target = rings[(ringPos + direction * n + rings.length) % rings.length];
    const candidates = placements.filter((place) => place.ring === target && on(place.index));
    if (candidates.length === 0) continue;
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
  return index;
}

export type HudKey = GridKey | "PageUp" | "PageDown";

export interface HudFocus {
  index: number;
  page: number;
}

/** The key step the HUD uses for arrows and PageUp/PageDown. */
export function stepHud(
  layout: HudLayout,
  focus: HudFocus,
  key: HudKey,
  selectable?: readonly boolean[],
): HudFocus {
  if (key === "PageUp" || key === "PageDown") {
    if (layout.pageCount <= 1) return focus;
    const direction = key === "PageDown" ? 1 : -1;
    const page = (focus.page + direction + layout.pageCount) % layout.pageCount;
    const onPage = layout.segments.filter((segment) => segment.page === page);
    const lit = onPage.filter((segment) => !selectable || selectable[segment.index]);
    const index = lit[0]?.index ?? onPage[0]?.index ?? focus.index;
    return { index, page };
  }
  const visible = layout.segments.filter((segment) => segment.page === focus.page);
  const next = nextRingTile(focus.index, visible, key, selectable);
  if (next < 0) return focus;
  const segment = layout.segments.find((place) => place.index === next);
  return { index: next, page: segment?.page ?? focus.page };
}
