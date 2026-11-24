import { matchAiApps } from "../shared/match";
import type { DiscoveredApp, InstalledProgram, ShortcutRecord } from "../shared/types";
import { readInstalledPrograms } from "./registry";
import { scanShortcuts, windowsStartMenuRoots } from "./shortcuts";

export interface DiscoveryInput {
  shortcuts: readonly ShortcutRecord[];
  programs: readonly InstalledProgram[];
}

export function discoverFromRecords(input: DiscoveryInput): DiscoveredApp[] {
  return matchAiApps(input);
}

export async function discoverInstalledApps(options: {
  platform: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  /** Overrides the start-menu roots. Tests pass a temp directory here. */
  shortcutRoots?: readonly string[];
  readTarget?: (lnkPath: string) => string | undefined;
  programs?: InstalledProgram[];
}): Promise<DiscoveredApp[]> {
  const env = options.env ?? process.env;
  const roots =
    options.shortcutRoots ?? (options.platform === "win32" ? windowsStartMenuRoots(env) : []);
  const shortcuts = scanShortcuts(roots, { readTarget: options.readTarget });
  const programs = options.programs ?? (await readInstalledPrograms(options.platform));
  return discoverFromRecords({ shortcuts, programs });
}
