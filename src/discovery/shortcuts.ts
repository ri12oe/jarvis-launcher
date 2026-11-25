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

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

/**
 * Read `.lnk` files under the given roots. Symlinks are not followed.
 * Missing roots are skipped. This only reads the directory tree.
 * Each directory read yields so a large Start Menu cannot freeze the HUD or the hotkey.
 * `readTarget` stays on the caller: `shell.readShortcutLink` is a main-process API.
 */
export async function scanShortcuts(roots: readonly string[], options: ScanOptions = {}): Promise<ShortcutRecord[]> {
  const maxDepth = options.maxDepth ?? 8;
  const found: ShortcutRecord[] = [];

  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > maxDepth) return;
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      await yieldToEventLoop();
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full, depth + 1);
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
    await walk(root, 0);
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
