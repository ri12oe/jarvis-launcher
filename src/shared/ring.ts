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

function circleEdge(y: number, cx: number, cy: number, radius: number): number {
  const dy = y - cy;
  if (dy * dy >= radius * radius) return cx - radius;
  return cx - Math.sqrt(radius * radius - dy * dy);
}

export function hudFrame(viewport: Viewport, options?: LayoutOptions): HudFrame {
  const width = viewport.width;
  const height = viewport.height;
  const header = clamp(Math.round(height * 0.068), 46, 74);
  const footer = FOOTER_BLOCK;
  const railW = clamp(Math.round(width * 0.1), 136, 196);
  const sideW = clamp(Math.round(width * 0.22), 150, 420);
  const calendarW = clamp(Math.round(width * 0.1), 78, 160);
  const emblemW = clamp(Math.round(width * 0.16), 156, 300);
  const systemW = clamp(Math.round(width * 0.155), 168, 280);
  const contentBottom = Math.max(header + 160, options?.subtitle ? subtitlePanelBox(viewport).top - SUBTITLE_GAP : height - footer);
  const vertical = contentBottom - header;
  const reactor = Math.max(180, Math.min(vertical * 0.94, width - railW - 28));
  const cx = width / 2;
  const cy = header + vertical / 2;
  const segH = clamp(reactor * 0.062, 18, 46);
  const segW = clamp(reactor * 0.18, 52, 180);
  const segRadius = Math.max(reactor * 0.32, reactor / 2 - segH * 0.7 - 8);
  const buttonH = clamp(Math.round(height * 0.044), 24, 46);
  const railTop = header + 8;
  const railBottom = Math.min(railTop + 6 * buttonH + 20, contentBottom - 96);
  const wifiH = clamp(Math.round(height * 0.2), 76, 188);
  const wifiTop = Math.max(railBottom + 40, height - footer - wifiH);
  const levelTop = railBottom + 10;
  const levelBottom = Math.min(levelTop + clamp(Math.round(height * 0.16), 40, 210), wifiTop - 16);
  const rail: Aabb = { left: 8, top: railTop, right: railW - 8, bottom: railBottom };
  const level: Aabb = { left: 16, top: levelTop, right: Math.min(72, railW - 16), bottom: levelBottom };
  const wifi: Aabb = { left: 10, top: wifiTop, right: Math.min(width * 0.22, Math.max(railW + 8, 210)), bottom: height - footer - 6 };
  const clockTop = header + 4;
  const clockMid = clockTop + Math.min(92, height * 0.1);
  const clockLimit = circleEdge(clockMid, cx, cy, reactor / 2) - 12;
  const clock: Aabb = {
    left: railW + 14,
    top: clockTop,
    right: Math.max(railW + 160, Math.min(railW + 14 + width * 0.27, clockLimit)),
    bottom: Math.min(clockTop + height * 0.42, cy - segRadius * 0.2),
  };
  const tabH = clamp(Math.round(header * 0.72), 30, 48);
  const tabTop = Math.max(4, (header - tabH) / 2);
  const tabs: Aabb = {
    left: emblemW + 16,
    top: tabTop,
    right: Math.max(emblemW + 52, width - calendarW - systemW - 10),
    bottom: tabTop + tabH,
  };
  const bounds: Aabb = {
    left: railW + 2,
    top: header + 2,
    right: width - clamp(Math.round(width * 0.18), 150, 300),
    bottom: contentBottom - 2,
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

function tryRing(frame: HudFrame, count: number, radius: number, boxW: number, boxH: number): SegmentSlot[] | null {
  const slots: SegmentSlot[] = [];
  for (let slot = 0; slot < count; slot++) {
    const angle = segmentAngle(slot, count);
    const point = segmentPoint(angle, radius);
    const x = frame.cx + point.x;
    const y = frame.cy + point.y;
    const box = rotatedAabb(x, y, boxW, boxH, angle);
    if (!inside(frame.bounds, box)) return null;
    for (const prev of slots) {
      if (boxesOverlap(prev.box, box, 1)) return null;
    }
    slots.push({ angle, rotation: uprightRotation(angle), x, y, box, width: boxW, height: boxH });
  }
  return slots;
}

function ringsClear(outer: readonly SegmentSlot[], inner: readonly SegmentSlot[]): boolean {
  return inner.every((slot) => outer.every((other) => !boxesOverlap(slot.box, other.box, 1)));
}

/** Outer and inner plate rings. Twenty tiles fit at 1920 when both rings pack. */
export function reactorSlots(frame: HudFrame): SegmentSlot[] {
  const counts = frame.reactor < 420 ? [8, 6] : [12, 10, 8, 6];
  let width = Math.min(frame.segW, 100);
  let height = Math.min(frame.segH, 28);
  for (let shrink = 0; shrink < 8; shrink++) {
    for (const count of counts) {
      const outer = tryRing(frame, count, frame.segRadius, width, height);
      if (!outer) continue;
      const innerW = Math.max(28, width * 0.82);
      const innerH = Math.max(14, height * 0.8);
      const minRadius = frame.reactor * 0.2 + Math.hypot(innerW, innerH) / 2 + 6;
      for (let step = 0; step < 10; step++) {
        const innerRadius = frame.segRadius * (0.8 - step * 0.035);
        if (innerRadius < minRadius) break;
        const inner = tryRing(frame, count, innerRadius, innerW, innerH);
        if (inner && ringsClear(outer, inner)) return [...outer, ...inner];
      }
    }
    width = Math.max(32, width * 0.84);
    height = Math.max(14, height * 0.88);
  }
  const single = tryRing(frame, 8, frame.segRadius, width, height);
  if (single) return single;
  const box = rotatedAabb(frame.cx, frame.cy, width, height, 0);
  return [{ angle: 0, rotation: 0, x: frame.cx, y: frame.cy, box, width, height }];
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

function railStack(area: Aabb, count: number, gap: number, prefer: number): Aabb[] | null {
  if (count <= 0) return [];
  const gaps = gap * Math.max(0, count - 1);
  const available = area.bottom - area.top - gaps;
  const height = Math.min(prefer, available / count);
  if (height < 20) return null;
  return Array.from({ length: count }, (_, slot) => {
    const top = area.top + slot * (height + gap);
    return { left: area.left, top, right: area.right, bottom: top + height };
  });
}

function fitCount(total: number, area: Aabb, gap: number, min: number, axis: "row" | "column"): number {
  for (let count = total; count >= 1; count--) {
    const boxes = axis === "row" ? rowBoxes(area, count, gap, min) : columnBoxes(area, count, gap, min);
    if (boxes) return count;
  }
  return 0;
}

function placeBox(index: number, zone: TileZone, ring: number, slot: number, count: number, box: Aabb, pinned: boolean, page: number): RingPlacement {
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
  const groups: Record<TileZone, number[]> = { rail: [], tab: [], segment: [] };
  tiles.forEach((tile, index) => {
    groups[tileZone(tile)].push(index);
  });

  const railPrefer = clamp(Math.round(viewport.height * 0.044), 24, 46);
  let railFit = 0;
  for (let count = groups.rail.length; count >= 1; count--) {
    if (railStack(frame.rail, count, 4, railPrefer)) {
      railFit = count;
      break;
    }
  }
  const tabFit = fitCount(groups.tab.length, frame.tabs, 4, 46, "row");
  const railShown = groups.rail.slice(0, railFit);
  const tabShown = groups.tab.slice(0, tabFit);
  const queued = [...groups.segment, ...groups.rail.slice(railFit), ...groups.tab.slice(tabFit)];
  const slots = reactorSlots(frame);
  const capacity = Math.max(1, slots.length);
  const pageCount = Math.max(1, Math.ceil(queued.length / capacity));
  const placed: RingPlacement[] = new Array(tiles.length);

  const railBoxes = railStack(frame.rail, railShown.length, 4, railPrefer) ?? [];
  railShown.forEach((index, slot) => {
    const box = railBoxes[slot];
    if (!box) return;
    placed[index] = placeBox(index, "rail", 1, slot, railShown.length, box, true, 0);
  });

  const tabBoxes = rowBoxes(frame.tabs, tabShown.length, 4, 46) ?? [];
  tabShown.forEach((index, slot) => {
    const box = tabBoxes[slot];
    if (!box) return;
    const place = placeBox(index, "tab", 0, slot, tabShown.length, box, true, 0);
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
    const place = placeBox(index, "segment", 2, slot, onPage, box, false, page);
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
export function placedTileBoxes(layout: HudLayout): Aabb[] {
  const boxes: Aabb[] = [];
  for (const segment of layout.segments) boxes.push(segment.icon, segment.label);
  return boxes;
}

export interface ChromeLayout {
  /** Small window: analog clock and the second gauge are omitted. */
  compact: boolean;
  /** Power buttons show icons only. Their words do not fit at this width. */
  iconPower: boolean;
  calendar: Aabb;
  analog?: Aabb;
  ram: Aabb;
  bin: Aabb;
  gauges: Aabb[];
  wifi: Aabb;
  hint: Aabb;
  commands: Aabb;
  search: Aabb;
  media: Aabb;
  uptime: Aabb;
  /** Previous, page numbers, and next. Empty when there is one page. */
  pager: Aabb[];
  dial?: Aabb;
}

function box(left: number, top: number, width: number, height: number): Aabb {
  return { left, top, right: left + width, bottom: top + height };
}

/** Placeholder widgets and footer controls, in window coordinates. */
export function chromeLayout(viewport: Viewport, options?: LayoutOptions & { pages?: number }): ChromeLayout {
  const frame = hudFrame(viewport, options);
  const { width, height } = viewport;
  const compact = width < 1000 || height < 640;
  const iconPower = width < 1400;
  const dayH = clamp(Math.round(width * 0.058), 48, 110);
  const calendar = box(width - frame.calendarW - 8, 2, frame.calendarW, dayH + 40);
  let analog: Aabb | undefined;
  if (!compact) {
    const size = clamp(Math.round(Math.min(width, height) * 0.1), 110, 170);
    analog = box(width - size - 12, calendar.bottom + 10, size, size + 18);
  }
  const disk = compact ? 64 : clamp(Math.round(width * 0.07), 88, 128);
  let diskTop = analog ? analog.bottom + 12 : Math.max(frame.header + 8, calendar.bottom + 8);
  const ram = box(width - disk - 12, diskTop, disk, disk);
  const bin = box(width - disk - 12, ram.bottom + 10, disk, disk);
  const subtitle = options?.subtitle ? subtitlePanelBox(viewport) : undefined;
  let dial: Aabb | undefined;
  if (!compact) {
    const size = clamp(Math.round(Math.min(width, height) * 0.12), 108, 168);
    dial = box(width - size - 8, height - size - 4, size, size);
  }
  const rightEdge = dial ? dial.left - 8 : width - 8;
  const gaugeW = compact ? 120 : clamp(Math.round(width * 0.14), 160, 230);
  const gaugeH = Math.round(gaugeW * 0.56);
  const gaugeBottom = Math.min(height - frame.footer - 8, dial ? dial.top - 8 : height);
  const gaugeRight = width - 10;
  let gaugeLeft = gaugeRight - gaugeW;
  if (subtitle && gaugeLeft < subtitle.right + 8) gaugeLeft = subtitle.right + 8;
  const gaugeTop = Math.min(gaugeBottom - gaugeH, Math.max(bin.bottom + 10, gaugeBottom - gaugeH));
  const fittedH = Math.max(64, gaugeBottom - Math.max(gaugeTop, bin.bottom + 10));
  const gauges = [box(gaugeLeft, gaugeBottom - fittedH, Math.max(64, gaugeRight - gaugeLeft), fittedH)];
  if (!compact) {
    const overlap = Math.round(gaugeW * 0.22);
    const left = Math.max(subtitle ? subtitle.right + 8 : 8, gaugeLeft - overlap);
    if (left + 48 < gaugeLeft) gauges.unshift(box(left, gaugeBottom - fittedH, gaugeW, fittedH));
  }
  const footerTop = height - frame.footer + 8;
  const footerH = frame.footer - 16;
  const pages = options?.pages ?? 1;
  const gap = 6;
  let hintW = 156;
  let commandW = compact ? 236 : 276;
  let mediaW = compact ? 168 : 248;
  const uptimeW = 60;
  const pagerW = pages > 1 ? 140 : 0;
  const edges = 8 + (width - rightEdge);
  const gaps = gap * (pagerW ? 5 : 4);
  const searchMin = 72;
  let used = edges + hintW + commandW + pagerW + mediaW + uptimeW + gaps + searchMin;
  if (used > width) {
    const over = used - width;
    const mediaCut = Math.min(over, mediaW - 140);
    mediaW -= mediaCut;
    used -= mediaCut;
  }
  if (used > width) hintW = Math.max(120, hintW - (used - width));
  let x = 8;
  const hint = box(x, footerTop, hintW, footerH);
  x += hintW + gap;
  const commands = box(x, footerTop, commandW, footerH);
  x += commandW + gap;
  const pager =
    pagerW === 0
      ? []
      : [box(x, footerTop, 28, footerH), box(x + 34, footerTop, 72, footerH), box(x + 112, footerTop, 28, footerH)];
  x += pagerW + (pagerW ? gap : 0);
  const tail = mediaW + gap + uptimeW;
  const searchW = Math.max(searchMin, rightEdge - tail - x);
  const search = box(x, footerTop, searchW, footerH);
  const media = box(search.right + gap, footerTop, mediaW, footerH);
  const uptime = box(Math.min(media.right + gap, rightEdge - uptimeW), footerTop, uptimeW, footerH);
  return {
    compact,
    iconPower,
    calendar,
    analog,
    ram,
    bin,
    gauges,
    wifi: frame.wifi,
    hint,
    commands,
    search,
    media,
    uptime,
    pager,
    dial,
  };
}

/**
 * Previous, readout, and next controls. They sit in the footer, clear of the
 * search pill and the command buttons.
 */
export function pageControlBoxes(viewport: Viewport, pageCount: number): Aabb[] {
  if (pageCount < 2) return [];
  return chromeLayout(viewport, { pages: pageCount }).pager;
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

function railStep(
  visible: readonly RingPlacement[],
  index: number,
  key: HudKey,
  selectable?: readonly boolean[],
): number | null {
  if (key !== "ArrowUp" && key !== "ArrowDown") return null;
  const rails = visible
    .filter((place) => place.zone === "rail" && (!selectable || selectable[place.index] === true))
    .slice()
    .sort((a, b) => a.slot - b.slot);
  const at = rails.findIndex((place) => place.index === index);
  if (at < 0) return null;
  const next = rails[at + (key === "ArrowDown" ? 1 : -1)];
  return next ? next.index : null;
}

/** The key step the HUD uses for arrows and PageUp/PageDown. */
export function stepHud(
  layout: HudLayout,
  focus: HudFocus,
  key: HudKey,
  selectable?: readonly boolean[],
): HudFocus {
  if (key === "ArrowUp" || key === "ArrowDown") {
    const along = railStep(visibleOnPage(layout, focus.page), focus.index, key, selectable);
    if (along != null) return { index: along, page: focus.page };
  }
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
