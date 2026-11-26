/**
 * MARIO OS layout. The HUD is drawn on a fixed 1192 x 670 design canvas that
 * is scaled to the screen, so every panel sits where it does in the Figma file.
 * Slot text is copied from the design as it is written there.
 */

export const DESIGN_W = 1192;
export const DESIGN_H = 670;

/** Reactor centre and plate ring radii, in design pixels. */
export const REACTOR = { cx: 600, cy: 331, plateOuter: 205, plateInner: 172 } as const;

export type SlotZone = "tab" | "left" | "ring";

export interface SlotDef {
  /** Text exactly as the design shows it. */
  text: string;
  /** Real product name, for filtering and for "not found" messages. */
  name: string;
  /** Tile ids that can fill this slot, best first. */
  ids: readonly string[];
}

export const TAB_SLOTS: readonly SlotDef[] = [
  { text: "Claude", name: "Claude", ids: ["claude"] },
  { text: "Copiiolt", name: "Copilot", ids: ["copilot"] },
  { text: "Grok", name: "Grok", ids: ["grok"] },
  { text: "Gemmi", name: "Gemini", ids: ["gemini", "gemini-web"] },
  { text: "V3 Code", name: "VS Code", ids: ["vscode"] },
  { text: "Mircosoft Doc", name: "Word", ids: ["word"] },
];

export const LEFT_SLOTS: readonly SlotDef[] = [
  { text: "Microsoft Edge", name: "Microsoft Edge", ids: ["edge"] },
  { text: "File Explorer", name: "File Explorer", ids: ["explorer"] },
  { text: "Spoftiy", name: "Spotify", ids: ["spotify"] },
  { text: "Outlook", name: "Outlook", ids: ["outlook"] },
  { text: "GitHub", name: "GitHub", ids: ["github", "github-web"] },
  { text: "x", name: "X", ids: ["x"] },
];

export const RING_COUNT = 24;

/**
 * The 24 reactor plates, clockwise from 12 o'clock. Plate k spans
 * k*15 to (k+1)*15 degrees. `text` plates and `glyph` plates are drawn
 * as the design draws them. `open` plates are blank in the design and hold
 * every tile that has no named slot.
 */
export type RingPlate =
  | { kind: "text"; lines: readonly string[] }
  | { kind: "glyph" }
  | { kind: "open" };

export const RING_PLATES: readonly RingPlate[] = [
  { kind: "text", lines: ["BARDA", "DBCM"] },
  { kind: "text", lines: ["APL DIT"] },
  { kind: "glyph" },
  { kind: "open" },
  { kind: "text", lines: ["APLE"] },
  { kind: "text", lines: ["CNHBS"] },
  { kind: "text", lines: ["CMBS"] },
  { kind: "text", lines: ["LOPE"] },
  { kind: "glyph" },
  { kind: "open" },
  { kind: "open" },
  { kind: "open" },
  { kind: "open" },
  { kind: "open" },
  { kind: "open" },
  { kind: "glyph" },
  { kind: "text", lines: ["ASNEX"] },
  { kind: "text", lines: ["ETTAL"] },
  { kind: "text", lines: ["SEPA"] },
  { kind: "text", lines: ["CCRP"] },
  { kind: "open" },
  { kind: "glyph" },
  { kind: "text", lines: ["TEN OPF"] },
  { kind: "text", lines: ["EDAE", "TIEUE"] },
];

/** Plate indexes that take overflow tiles, in fill order (bottom arc first). */
export const OPEN_PLATES: readonly number[] = [12, 11, 13, 10, 14, 9, 3, 20];

export interface SlotTile {
  id: string;
  label: string;
}

export interface PlacedSlot {
  zone: SlotZone;
  /** Position within its zone: tab 0-5, left 0-5, ring plate 0-23. */
  slot: number;
  /** Design text for named slots. Empty for open plates, which show the tile label. */
  text: string;
  /** Real product name for named slots. Empty for open plates. */
  name: string;
  /** Index into the tile list, or -1 when no installed app fills a named slot. */
  tile: number;
}

export interface MarioLayout {
  tabs: PlacedSlot[];
  left: PlacedSlot[];
  /** Open plates on the current page that hold a tile. */
  ring: PlacedSlot[];
  /** Page of every tile index that sits on an open plate. */
  ringPage: Map<number, number>;
  pageCount: number;
}

function fillNamed(zone: SlotZone, defs: readonly SlotDef[], byId: Map<string, number>, used: Set<number>): PlacedSlot[] {
  return defs.map((def, slot) => {
    let tile = -1;
    for (const id of def.ids) {
      const index = byId.get(id);
      if (index !== undefined && !used.has(index)) {
        tile = index;
        break;
      }
    }
    if (tile >= 0) used.add(tile);
    return { zone, slot, text: def.text, name: def.name, tile };
  });
}

export function layoutMario(tiles: readonly SlotTile[], page: number): MarioLayout {
  const byId = new Map(tiles.map((tile, index) => [tile.id, index]));
  const used = new Set<number>();
  const tabs = fillNamed("tab", TAB_SLOTS, byId, used);
  const left = fillNamed("left", LEFT_SLOTS, byId, used);
  const rest = tiles.map((_, index) => index).filter((index) => !used.has(index));
  const perPage = OPEN_PLATES.length;
  const pageCount = Math.max(1, Math.ceil(rest.length / perPage));
  const current = Math.max(0, Math.min(page, pageCount - 1));
  const ringPage = new Map<number, number>();
  rest.forEach((index, order) => ringPage.set(index, Math.floor(order / perPage)));
  const ring = rest.slice(current * perPage, current * perPage + perPage).map((tile, order) => ({
    zone: "ring" as const,
    slot: OPEN_PLATES[order],
    text: "",
    name: "",
    tile,
  }));
  return { tabs, left, ring, ringPage, pageCount };
}

/** Name used for filtering a slot: the design text and the real app name both count. */
export function slotMatches(slot: PlacedSlot, tiles: readonly SlotTile[], query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const label = slot.tile >= 0 ? (tiles[slot.tile]?.label ?? "") : "";
  return [label, slot.text, slot.name].some((value) => value.toLowerCase().includes(needle));
}

export type StepKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";

export interface Focus {
  zone: SlotZone;
  slot: number;
}

function zoneSlots(layout: MarioLayout, zone: SlotZone): PlacedSlot[] {
  if (zone === "tab") return layout.tabs;
  if (zone === "left") return layout.left;
  return [...layout.ring].sort((a, b) => a.slot - b.slot);
}

const ZONES: readonly SlotZone[] = ["tab", "left", "ring"];
/** The design opens with Microsoft Edge lit, so focus starts in the left column. */
const FIRST_ZONES: readonly SlotZone[] = ["left", "tab", "ring"];

/**
 * Left and Right move through a zone and wrap. Up and Down move to the next
 * zone that has a selectable slot. In the left column Up and Down move
 * between buttons first, the way the column reads.
 */
export function stepMario(
  layout: MarioLayout,
  focus: Focus,
  key: StepKey,
  selectable: (slot: PlacedSlot) => boolean,
): Focus {
  const inZone = (zone: SlotZone) => zoneSlots(layout, zone).filter(selectable);
  const move = (zone: SlotZone, delta: number): Focus | null => {
    const list = inZone(zone);
    if (list.length === 0) return null;
    const at = list.findIndex((slot) => slot.slot === focus.slot && slot.zone === focus.zone);
    const next = at < 0 ? (delta > 0 ? 0 : list.length - 1) : (at + delta + list.length) % list.length;
    return { zone, slot: list[next].slot };
  };
  const jump = (delta: number): Focus => {
    const start = ZONES.indexOf(focus.zone);
    for (let step = 1; step <= ZONES.length; step++) {
      const zone = ZONES[(start + delta * step + ZONES.length * 2) % ZONES.length];
      const list = inZone(zone);
      if (list.length > 0) return { zone, slot: list[0].slot };
    }
    return focus;
  };
  if (focus.zone === "left" && (key === "ArrowUp" || key === "ArrowDown")) {
    const list = inZone("left");
    const at = list.findIndex((slot) => slot.slot === focus.slot);
    const delta = key === "ArrowDown" ? 1 : -1;
    const next = at + delta;
    if (at >= 0 && next >= 0 && next < list.length) return { zone: "left", slot: list[next].slot };
    return jump(delta);
  }
  if (key === "ArrowLeft") return move(focus.zone, -1) ?? focus;
  if (key === "ArrowRight") return move(focus.zone, 1) ?? focus;
  return jump(key === "ArrowDown" ? 1 : -1);
}

/** First selectable slot: the left column, then the tabs, then the ring. */
export function firstFocus(layout: MarioLayout, selectable: (slot: PlacedSlot) => boolean): Focus | null {
  for (const zone of FIRST_ZONES) {
    const hit = zoneSlots(layout, zone).find(selectable);
    if (hit) return { zone, slot: hit.slot };
  }
  return null;
}

/** Plate centre angle in radians, clockwise from 12 o'clock. */
export function plateAngle(slot: number): number {
  return ((slot + 0.5) * 2 * Math.PI) / RING_COUNT;
}

export interface CanvasFit {
  /** Uniform scale, so circles stay round. */
  scale: number;
  /** Design pixels the window has beyond 1192 x 670 on each axis. One of them is always 0. */
  extraX: number;
  extraY: number;
}

/**
 * Scale the design to the window without stretching it. On a screen that is
 * not 16:9 the spare room is not left as black bars: each panel group is moved
 * by its share of it (see `shift`), so the header stays on the top edge, the
 * bottom row on the bottom edge, and everything between spreads out evenly.
 */
export function fitCanvas(width: number, height: number): CanvasFit {
  const scale = Math.min(width / DESIGN_W, height / DESIGN_H);
  return {
    scale,
    extraX: Math.max(0, width / scale - DESIGN_W),
    extraY: Math.max(0, height / scale - DESIGN_H),
  };
}

/** Offset for a panel group. `fx` and `fy` are 0 at the left/top edge and 1 at the right/bottom edge. */
export function shift(fit: Pick<CanvasFit, "extraX" | "extraY">, fx: number, fy: number): { x: number; y: number } {
  return { x: fit.extraX * fx, y: fit.extraY * fy };
}
