export type GridKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";

/** Center of a tile, in the same units for every tile. */
export interface TilePoint {
  x: number;
  y: number;
}

export function filterTiles<T extends { label: string }>(tiles: readonly T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return tiles.slice();
  return tiles.filter((tile) => tile.label.toLowerCase().includes(needle));
}

/** Keeps the focused index on a tile that is still in the list. */
export function clampIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  if (index < 0) return 0;
  if (index >= count) return count - 1;
  return index;
}

const ALIGN = 4;

function axisPitch(points: readonly TilePoint[], axis: "x" | "y"): number {
  const other = axis === "x" ? "y" : "x";
  let best = Infinity;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      if (Math.abs(points[i][other] - points[j][other]) > ALIGN) continue;
      const delta = Math.abs(points[i][axis] - points[j][axis]);
      if (delta > ALIGN && delta < best) best = delta;
    }
  }
  return best;
}

/**
 * Moves to the nearest tile in that direction.
 * A step with nothing visually that way stays put, including a gap in a short last row.
 */
export function nextVisibleTile(index: number, points: readonly TilePoint[], key: GridKey): number {
  if (points.length === 0) return -1;
  if (index < 0 || index >= points.length) return 0;
  const origin = points[index];
  const horizontal = key === "ArrowLeft" || key === "ArrowRight";
  const forward = key === "ArrowRight" || key === "ArrowDown" ? 1 : -1;
  const mainAxis = horizontal ? "x" : "y";
  const crossAxis = horizontal ? "y" : "x";
  const pitch = axisPitch(points, crossAxis);
  const slack = Number.isFinite(pitch) ? pitch / 2 : Infinity;

  let best = -1;
  let bestMain = Infinity;
  let bestCross = Infinity;
  for (let i = 0; i < points.length; i++) {
    if (i === index) continue;
    const main = (points[i][mainAxis] - origin[mainAxis]) * forward;
    const cross = Math.abs(points[i][crossAxis] - origin[crossAxis]);
    if (main <= ALIGN) continue;
    if (cross > slack) continue;
    if (main < bestMain - ALIGN || (Math.abs(main - bestMain) <= ALIGN && cross < bestCross)) {
      best = i;
      bestMain = main;
      bestCross = cross;
    }
  }
  return best === -1 ? index : best;
}

export interface FooterHintInput {
  status: string;
  refreshing: boolean;
  scanning: boolean;
  refreshFailed: boolean;
  query: string;
  warning: string;
}

/** Footer text for a failed launch, including the reason when there is one. */
export function launchStatusText(error: string | undefined): string {
  const reason = error?.trim();
  if (!reason || reason === "LAUNCH FAILED") return "LAUNCH FAILED";
  return `LAUNCH FAILED  ${reason}`;
}

export function isLaunchStatus(status: string): boolean {
  return status === "LAUNCH FAILED" || status.startsWith("LAUNCH FAILED ");
}

/** Footer text for a voice failure, including the reason when there is one. */
export function voiceStatusText(error: string | undefined): string {
  const reason = error?.trim();
  if (!reason || reason === "VOICE FAILED") return "VOICE FAILED";
  return `VOICE FAILED  ${reason}`;
}

export function isVoiceStatus(status: string): boolean {
  return status === "VOICE FAILED" || status.startsWith("VOICE FAILED ");
}

/** A tile click and a hide clear a launch failure or a voice failure. Other statuses stay. */
export function clearLaunchStatus(status: string): string {
  return isLaunchStatus(status) || isVoiceStatus(status) ? "" : status;
}

/** A published state must not wipe a launch or voice failure. The next user action does that. */
export function statusAfterPublish(current: string, refreshFailed: boolean): string {
  if (current === "LINK LOST" || isLaunchStatus(current) || isVoiceStatus(current)) return current;
  if (current === "REFRESH FAILED" && refreshFailed) return current;
  return "";
}

/** Footer hint. The first match wins, in the order the HUD should prefer. */
export function footerHint(input: FooterHintInput): string {
  if (input.status === "LINK LOST" || isLaunchStatus(input.status) || isVoiceStatus(input.status)) return input.status;
  if (input.refreshing) return "REFRESHING";
  if (input.scanning) return "SCANNING";
  if (input.refreshFailed || input.status === "REFRESH FAILED") return "REFRESH FAILED";
  const query = input.query.trim();
  if (query) return `FILTER  ${query.toUpperCase()}`;
  if (input.warning) return input.warning;
  return "SELECT A SYSTEM";
}
