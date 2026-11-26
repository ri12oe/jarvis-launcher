/**
 * Recent files for the HUD's left list: the newest shortcuts in the Windows
 * Recent folder whose targets still exist.
 */

export interface RecentShortcut {
  /** Shortcut file name, for example "Report.docx.lnk". */
  name: string;
  mtimeMs: number;
  /** Resolved target path, or "" when the shortcut could not be read. */
  target: string;
  exists: boolean;
}

export interface RecentItem {
  id: string;
  name: string;
}

export const RECENT_LIMIT = 12;

/** "Report.docx.lnk" -> "Report.docx". */
export function recentName(shortcut: string): string {
  return shortcut.replace(/\.lnk$/i, "").trim();
}

/** Newest first, one entry per target, only targets that exist. */
export function pickRecent(shortcuts: readonly RecentShortcut[], limit = RECENT_LIMIT): { name: string; target: string }[] {
  const picked: { name: string; target: string }[] = [];
  const seen = new Set<string>();
  for (const shortcut of [...shortcuts].sort((a, b) => b.mtimeMs - a.mtimeMs)) {
    if (!shortcut.target || !shortcut.exists) continue;
    const key = shortcut.target.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const name = recentName(shortcut.name);
    if (!name) continue;
    picked.push({ name, target: shortcut.target });
    if (picked.length >= limit) break;
  }
  return picked;
}

/** Upper case like the design, cut to fit the column. */
export function recentLabel(name: string, max = 24): string {
  const upper = name.toUpperCase();
  return upper.length > max ? `${upper.slice(0, max - 1)}…` : upper;
}
