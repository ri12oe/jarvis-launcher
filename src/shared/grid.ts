export type GridKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";

export function filterTiles<T extends { label: string }>(tiles: readonly T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return tiles.slice();
  return tiles.filter((tile) => tile.label.toLowerCase().includes(needle));
}

/** How many tiles sit on the first row, from their top offsets. */
export function columnCountFromOffsets(offsets: readonly number[]): number {
  if (offsets.length === 0) return 1;
  const top = offsets[0];
  let columns = 0;
  for (const offset of offsets) {
    if (offset !== top) break;
    columns += 1;
  }
  return Math.max(1, columns);
}

/**
 * Moves one step in the grid. An index outside the list starts at the first tile.
 * A step past either end stays put.
 */
export function nextGridIndex(index: number, count: number, columns: number, key: GridKey): number {
  if (count <= 0) return -1;
  const cols = Math.max(1, Math.floor(columns) || 1);
  if (index < 0 || index >= count) return 0;
  const delta = key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1 : key === "ArrowUp" ? -cols : cols;
  const next = index + delta;
  if (next < 0 || next >= count) return index;
  return next;
}

export interface FooterHintInput {
  status: string;
  refreshing: boolean;
  scanning: boolean;
  refreshFailed: boolean;
  query: string;
  warning: string;
}

/** Footer hint. The first match wins, in the order the HUD should prefer. */
export function footerHint(input: FooterHintInput): string {
  if (input.status === "LINK LOST" || input.status === "LAUNCH FAILED") return input.status;
  if (input.refreshing) return "REFRESHING";
  if (input.scanning) return "SCANNING";
  if (input.refreshFailed || input.status === "REFRESH FAILED") return "REFRESH FAILED";
  const query = input.query.trim();
  if (query) return `FILTER  ${query.toUpperCase()}`;
  if (input.warning) return input.warning;
  return "SELECT A SYSTEM";
}
