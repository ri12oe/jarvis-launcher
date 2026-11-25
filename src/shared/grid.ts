export type GridKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";

/** True when a label should stay bright for this filter. An empty query matches everything. */
export function tileMatches(label: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return label.toLowerCase().includes(needle);
}

/** Keeps the focused index on a tile that is still in the list. */
export function clampIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  if (index < 0) return 0;
  if (index >= count) return count - 1;
  return index;
}

export interface FooterHintInput {
  status: string;
  refreshing: boolean;
  scanning: boolean;
  refreshFailed: boolean;
  query: string;
  /** How many tiles the current query matches. Omit when nothing is being filtered. */
  matchCount?: number;
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
  if (query) {
    if (input.matchCount === 0) return "NO MATCH";
    return `FILTER  ${query.toUpperCase()}`;
  }
  if (input.warning) return input.warning;
  return "SELECT A SYSTEM";
}
