import type { GridKey } from "./grid";
import { AI_APP_IDS } from "./types";

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

/** Matches `.subtitle` max-height. The panel scrolls past this. */
export const SUBTITLE_MAX = 72;

/** Gap between the tiles and the subtitle panel. */
export const SUBTITLE_GAP = 8;

/** Bottom band reserved for the status bar. Tiles stay above it. */
export const FOOTER_BLOCK = 72;

const AI_IDS = new Set<string>(AI_APP_IDS);
const RAIL_IDS = new Set(["edge", "explorer", "desktop", "documents", "downloads", "pictures"]);
const AI_LABELS = new Set([
  "chatgpt",
  "claude",
  "cursor",
  "grok",
  "copilot",
  "perplexity",
  "ollama",
  "lm studio",
]);
const RAIL_LABELS = new Set([
  "microsoft edge",
  "file explorer",
  "desktop",
  "documents",
  "downloads",
  "pictures",
]);

export type TileZone = "rail" | "tab" | "segment";

export interface LayoutTile {
  label: string;
  id?: string;
  kind?: string;
}

/** Fixed apps and folders go on the left rail. Discovered AI apps go in the top tabs. */
export function tileZone(tile: LayoutTile): TileZone {
  const id = tile.id?.toLowerCase();
  if (id && AI_IDS.has(id)) return "tab";
  if (id && RAIL_IDS.has(id)) return "rail";
  if (tile.kind === "folder") return "rail";
  const label = tile.label.trim().toLowerCase();
  if (AI_LABELS.has(label)) return "tab";
  if (RAIL_LABELS.has(label)) return "rail";
  return "segment";
}

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

export type LabelSide = "top" | "right" | "bottom" | "left";

export interface RingPlacement {
  /** Index into the tile list passed to `layoutHud`. */
  index: number;
  page: number;
  ring: number;
  slot: number;
  count: number;
  /** Icon-center radius in CSS pixels. 0 for the rail and the tabs. */
  radius: number;
  /** Radians. 0 is 12 o'clock. Increases clockwise. */
  angle: number;
  side: LabelSide;
  /** Button center in window coordinates. y grows downward. */
  x: number;
  y: number;
  /** Axis-aligned button box, in window coordinates. */
  icon: Aabb;
  label: Aabb;
  ellipsis: boolean;
  zone?: TileZone;
  /** Shown on every segment page. */
  pinned?: boolean;
  /** Degrees for a segment button. 0 leaves the label upright at the top. */
  rotation?: number;
  width?: number;
  height?: number;
}

export interface HudFrame {
  header: number;
  footer: number;
  railW: number;
  sideW: number;
  calendarW: number;
  emblemW: number;
  systemW: number;
  cx: number;
  cy: number;
  reactor: number;
  segW: number;
  segH: number;
  segRadius: number;
  clock: Aabb;
  rail: Aabb;
  level: Aabb;
  wifi: Aabb;
  tabs: Aabb;
  bounds: Aabb;
}

export interface HudLayout {
  segments: RingPlacement[];
  pageCount: number;
  /** Reactor diameter in CSS pixels, one entry per page. */
  reactor: number[];
  icon: number;
  gap: number;
  labelFont: number;
  labelLine: number;
  labelMax: number;
  frame: HudFrame;
}

export interface LayoutOptions {
  /** Hold the subtitle band open so a voice turn does not move the tiles. */
  subtitle?: boolean;
}

export type LabelMeasurer = (text: string) => LabelMetrics;

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

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

/** The voice subtitle, centered above the footer. `viewport` is the full window. */
export function subtitlePanelBox(viewport: Viewport): Aabb {
  const width = Math.min(640, Math.max(180, viewport.width * 0.42));
  const left = (viewport.width - width) / 2;
  const bottom = viewport.height - FOOTER_BLOCK - 4;
  const top = bottom - SUBTITLE_MAX;
  return { left, top, right: left + width, bottom };
}

export function hudFrame(viewport: Viewport, options?: LayoutOptions): HudFrame {
  const width = viewport.width;
  const height = viewport.height;
  const header = clamp(Math.round(height * 0.078), 44, 78);
  const footer = FOOTER_BLOCK;
  const railW = clamp(Math.round(width * 0.118), 150, 228);
  const clockCol = clamp(Math.round(width * 0.13), 88, 300);
  const sideW = clamp(Math.round(width * 0.2), 160, 380);
  const calendarW = clamp(Math.round(width * 0.07), 56, 118);
  const emblemW = clamp(Math.round(width * 0.15), 148, 268);
  const systemW = clamp(Math.round(width * 0.17), 210, 300);
  const subtitleTop = options?.subtitle ? subtitlePanelBox(viewport).top - SUBTITLE_GAP : height - footer;
  const top = header + 4;
  const bottom = Math.max(top + 80, subtitleTop);
  const leftLimit = railW + clockCol;
  const rightLimit = width - sideW;
  const availW = Math.max(80, rightLimit - leftLimit);
  const availH = Math.max(80, bottom - top);
  const reactor = Math.max(96, Math.min(availW, availH) - 8);
  const cx = leftLimit + availW / 2;
  const cy = top + availH / 2;
  const segH = clamp(reactor * 0.052, 16, 32);
  const segW = clamp(reactor * 0.112, 42, 88);
  const segRadius = reactor / 2 - segH - 22;
  const levelH = clamp(Math.round(height * 0.09), 28, 64);
  const wifiH = clamp(Math.round(height * 0.16), 68, 120);
  const wifiTop = height - footer - wifiH;
  const levelTop = wifiTop - levelH - 6;
  const rail: Aabb = { left: 8, top: header + 6, right: railW - 6, bottom: Math.max(header + 40, levelTop - 6) };
  const level: Aabb = { left: 10, top: levelTop, right: railW - 8, bottom: levelTop + levelH };
  const wifi: Aabb = { left: 6, top: wifiTop, right: railW - 4, bottom: height - footer - 4 };
  const clock: Aabb = {
    left: railW + 6,
    top: header + 2,
    right: Math.max(railW + 80, cx - reactor / 2 - 8),
    bottom: Math.min(header + 2 + Math.max(72, reactor * 0.34), cy - 8),
  };
  const tabH = clamp(Math.round(header * 0.62), 28, 44);
  const tabTop = Math.max(4, (header - tabH) / 2);
  const tabs: Aabb = {
    left: emblemW + 4,
    top: tabTop,
    right: Math.max(emblemW + 48, width - calendarW - systemW - 8),
    bottom: tabTop + tabH,
  };
  const bounds: Aabb = {
    left: railW + 2,
    top: header + 2,
    right: width - sideW - 2,
    bottom,
  };
  return {
    header,
    footer,
    railW,
    sideW,
    calendarW,
    emblemW,
    systemW,
    cx,
    cy,
    reactor,
    segW,
    segH,
    segRadius,
    clock,
    rail,
    level,
    wifi,
    tabs,
    bounds,
  };
}

interface SegmentSlot {
  angle: number;
  rotation: number;
  x: number;
  y: number;
  box: Aabb;
  width: number;
  height: number;
}

function rotatedAabb(cx: number, cy: number, boxW: number, boxH: number, angle: number): Aabb {
  const c = Math.abs(Math.cos(angle));
  const s = Math.abs(Math.sin(angle));
  const halfW = (boxW * c + boxH * s) / 2;
  const halfH = (boxW * s + boxH * c) / 2;
  return { left: cx - halfW, top: cy - halfH, right: cx + halfW, bottom: cy + halfH };
}

function uprightRotation(angle: number): number {
  let degrees = (angle * 180) / Math.PI;
  if (degrees > 90 && degrees < 270) degrees += 180;
  return degrees;
}

function inside(bounds: Aabb, box: Aabb): boolean {
  return box.left >= bounds.left - 0.5 && box.top >= bounds.top - 0.5 && box.right <= bounds.right + 0.5 && box.bottom <= bounds.bottom + 0.5;
}

function segmentSlots(frame: HudFrame): SegmentSlot[] {
  let width = frame.segW;
  let height = frame.segH;
  let radius = frame.segRadius;
  for (let shrink = 0; shrink < 8; shrink++) {
    const packed = packSegments(frame, radius, width, height);
    if (packed.length > 0) return packed;
    width = Math.max(28, width * 0.86);
    height = Math.max(14, height * 0.86);
    radius = Math.max(28, radius * 0.9);
  }
  const box = rotatedAabb(frame.cx, frame.cy, width, height, 0);
  return [{ angle: 0, rotation: 0, x: frame.cx, y: frame.cy, box, width, height }];
}

function packSegments(frame: HudFrame, radius: number, boxW: number, boxH: number): SegmentSlot[] {
  const circumference = Math.PI * 2 * radius;
  let count = Math.min(16, Math.max(1, Math.floor(circumference / (boxW * 0.78))));
  while (count >= 1) {
    const slots: SegmentSlot[] = [];
    let ok = true;
    for (let slot = 0; slot < count; slot++) {
      const angle = segmentAngle(slot, count);
      const point = segmentPoint(angle, radius);
      const x = frame.cx + point.x;
      const y = frame.cy + point.y;
      const box = rotatedAabb(x, y, boxW, boxH, angle);
      if (!inside(frame.bounds, box)) {
        ok = false;
        break;
      }
      for (const prev of slots) {
        if (boxesOverlap(prev.box, box, 2)) {
          ok = false;
          break;
        }
      }
      if (!ok) break;
      slots.push({ angle, rotation: uprightRotation(angle), x, y, box, width: boxW, height: boxH });
    }
    if (ok) return slots;
    count -= 1;
  }
  return [];
}

function rowBoxes(area: Aabb, count: number, gap: number, min: number): Aabb[] | null {
  if (count <= 0) return [];
  const span = area.right - area.left - gap * (count - 1);
  const size = span / count;
  if (size < min) return null;
  return Array.from({ length: count }, (_, slot) => {
    const left = area.left + slot * (size + gap);
    return { left, top: area.top, right: left + size, bottom: area.bottom };
  });
}

function columnBoxes(area: Aabb, count: number, gap: number, min: number): Aabb[] | null {
  if (count <= 0) return [];
  const span = area.bottom - area.top - gap * (count - 1);
  const size = span / count;
  if (size < min) return null;
  return Array.from({ length: count }, (_, slot) => {
    const top = area.top + slot * (size + gap);
    return { left: area.left, top, right: area.right, bottom: top + size };
  });
}

function fitCount(total: number, area: Aabb, gap: number, min: number, axis: "row" | "column"): number {
  for (let count = total; count >= 1; count--) {
    const boxes = axis === "row" ? rowBoxes(area, count, gap, min) : columnBoxes(area, count, gap, min);
    if (boxes) return count;
  }
  return 0;
}

function placeBox(index: number, zone: TileZone, ring: number, slot: number, count: number, box: Aabb, measure: LabelMetrics, pinned: boolean, page: number): RingPlacement {
  const width = box.right - box.left;
  const height = box.bottom - box.top;
  return {
    index,
    page,
    ring,
    slot,
    count,
    radius: 0,
    angle: zone === "rail" ? Math.PI : 0,
    side: zone === "rail" ? "right" : "bottom",
    x: (box.left + box.right) / 2,
    y: (box.top + box.bottom) / 2,
    icon: box,
    label: box,
    ellipsis: measure.width > Math.max(12, width - (zone === "segment" ? 8 : 30)),
    zone,
    pinned,
    rotation: 0,
    width,
    height,
  };
}

/**
 * Places fixed tiles on the left rail, discovered AI apps in the top tabs,
 * and everything else on the reactor. Segment buttons that do not fit move
 * to the next page. Rail and tab buttons that do not fit join that queue.
 */
export function layoutHud<T extends LayoutTile>(
  tiles: readonly T[],
  viewport: Viewport,
  measure: LabelMeasurer = measureLabel,
  options?: LayoutOptions,
): HudLayout {
  if (viewport.width < 320 || viewport.height < 240) {
    return layoutHud(tiles, { width: Math.max(viewport.width, 1366), height: Math.max(viewport.height, 768) }, measure, options);
  }
  const frame = hudFrame(viewport, options);
  const metrics = tiles.map((tile) => measure(tile.label));
  const groups: Record<TileZone, number[]> = { rail: [], tab: [], segment: [] };
  tiles.forEach((tile, index) => {
    groups[tileZone(tile)].push(index);
  });

  const railFit = fitCount(groups.rail.length, frame.rail, 3, 20, "column");
  const tabFit = fitCount(groups.tab.length, frame.tabs, 4, 46, "row");
  const railShown = groups.rail.slice(0, railFit);
  const tabShown = groups.tab.slice(0, tabFit);
  const queued = [...groups.segment, ...groups.rail.slice(railFit), ...groups.tab.slice(tabFit)];
  const slots = segmentSlots(frame);
  const capacity = Math.max(1, slots.length);
  const pageCount = Math.max(1, Math.ceil(queued.length / capacity));
  const placed: RingPlacement[] = new Array(tiles.length);

  const railBoxes = columnBoxes(frame.rail, railShown.length, 3, 20) ?? [];
  railShown.forEach((index, slot) => {
    const box = railBoxes[slot];
    if (!box) return;
    placed[index] = placeBox(index, "rail", 1, slot, railShown.length, box, metrics[index], true, 0);
  });

  const tabBoxes = rowBoxes(frame.tabs, tabShown.length, 4, 46) ?? [];
  tabShown.forEach((index, slot) => {
    const box = tabBoxes[slot];
    if (!box) return;
    const place = placeBox(index, "tab", 0, slot, tabShown.length, box, metrics[index], true, 0);
    const spread = tabShown.length <= 1 ? 0 : (slot / (tabShown.length - 1) - 0.5) * 0.6;
    place.angle = spread;
    placed[index] = place;
  });

  queued.forEach((index, order) => {
    const page = Math.floor(order / capacity);
    const slot = order % capacity;
    const onPage = Math.min(capacity, queued.length - page * capacity);
    const geom = slots[slot] ?? slots[0];
    const box = geom?.box ?? {
      left: frame.cx - 20,
      top: frame.cy - 10,
      right: frame.cx + 20,
      bottom: frame.cy + 10,
    };
    const place = placeBox(index, "segment", 2, slot, onPage, box, metrics[index], false, page);
    if (geom) {
      place.angle = geom.angle;
      place.rotation = geom.rotation;
      place.x = geom.x;
      place.y = geom.y;
      place.radius = frame.segRadius;
      place.width = geom.width;
      place.height = geom.height;
      place.side = labelSide(geom.angle);
    }
    placed[index] = place;
  });

  const segments = placed.filter((place): place is RingPlacement => place != null);
  return {
    segments,
    pageCount,
    reactor: Array.from({ length: pageCount }, () => frame.reactor),
    icon: 22,
    gap: 6,
    labelFont: LABEL_FONT,
    labelLine: LABEL_LINE,
    labelMax: LABEL_MAX_WIDTH,
    frame,
  };
}

/** Button boxes for every placed tile, in window coordinates. */
export function placedTileBoxes(layout: HudLayout, _layoutViewport?: Viewport): Aabb[] {
  const boxes: Aabb[] = [];
  for (const segment of layout.segments) boxes.push(segment.icon, segment.label);
  return boxes;
}

/**
 * Previous, readout, and next controls. They sit in the footer, under the tiles.
 * Coordinates are the window, the same space as `placedTileBoxes`.
 */
export function pageControlBoxes(viewport: Viewport, pageCount: number): Aabb[] {
  if (pageCount < 2) return [];
  const frame = hudFrame(viewport);
  const top = viewport.height - frame.footer + 8;
  const bottom = viewport.height - 8;
  const cx = frame.cx;
  return [
    { left: cx - 86, right: cx - 52, top, bottom },
    { left: cx - 48, right: cx + 48, top, bottom },
    { left: cx + 52, right: cx + 86, top, bottom },
  ];
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

function visibleOnPage(layout: HudLayout, page: number): RingPlacement[] {
  return layout.segments.filter((segment) => segment.pinned || segment.page === page);
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
    const onPage = layout.segments.filter((segment) => segment.page === page && !segment.pinned);
    const lit = onPage.filter((segment) => !selectable || selectable[segment.index]);
    const index = lit[0]?.index ?? onPage[0]?.index ?? focus.index;
    return { index, page };
  }
  const visible = visibleOnPage(layout, focus.page);
  const next = nextRingTile(focus.index, visible, key, selectable);
  if (next < 0) return focus;
  const segment = layout.segments.find((place) => place.index === next);
  const page = segment?.pinned ? focus.page : (segment?.page ?? focus.page);
  return { index: next, page };
}
