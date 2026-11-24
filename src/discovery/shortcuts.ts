import fs from "node:fs";
import path from "node:path";
import type { ShortcutRecord } from "../shared/types";

export interface ScanOptions {
  /** How many directories deep to walk. The start-menu root is depth 0. */
  maxDepth?: number;
  /**
   * Optional reader for `.lnk` targets. Omitted in tests and on non-Windows hosts.
   * Failures are ignored; the shortcut file itself is still launchable on Windows.
   */
  readTarget?: (lnkPath: string) => string | undefined;
}

function shortcutName(filePath: string): string {
  return path.basename(filePath, path.extname(filePath));
}

/**
 * Read `.lnk` files under the given roots. Symlinks are not followed.
 * Missing roots are skipped. This only reads the directory tree.
 */
export function scanShortcuts(roots: readonly string[], options: ScanOptions = {}): ShortcutRecord[] {
  const maxDepth = options.maxDepth ?? 8;
  const found: ShortcutRecord[] = [];

  const walk = (dir: string, depth: number) => {
    if (depth > maxDepth) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
        continue;
      }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".lnk")) continue;
      let target: string | undefined;
      if (options.readTarget) {
        try {
          target = options.readTarget(full);
        } catch {
          target = undefined;
        }
      }
      found.push({ name: shortcutName(full), lnkPath: full, target });
    }
  };

  for (const root of roots) {
    if (!root) continue;
    walk(root, 0);
  }
  return found;
}

export function windowsStartMenuRoots(env: NodeJS.ProcessEnv = process.env): string[] {
  const roots: string[] = [];
  if (env.ProgramData) {
    roots.push(path.win32.join(env.ProgramData, "Microsoft", "Windows", "Start Menu", "Programs"));
  }
  if (env.APPDATA) {
    roots.push(path.win32.join(env.APPDATA, "Microsoft", "Windows", "Start Menu", "Programs"));
  }
  return roots;
}
