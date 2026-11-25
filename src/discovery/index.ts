import { matchAiApps } from "../shared/match";
import type { StoreApp } from "../shared/start-apps";
import type { DiscoveredApp, InstalledProgram } from "../shared/types";
import { readInstalledPrograms } from "./registry";
import { readStartApps } from "./start-apps";
import { scanShortcuts, windowsStartMenuRoots } from "./shortcuts";

export async function discoverInstalledApps(options: {
  platform: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  /** Overrides the start-menu roots. Tests pass a temp directory here. */
  shortcutRoots?: readonly string[];
  readTarget?: (lnkPath: string) => string | undefined;
  programs?: InstalledProgram[];
  /** Pass this in tests. Omitted on a real Windows host, where Get-StartApps runs. */
  storeApps?: readonly StoreApp[];
}): Promise<DiscoveredApp[]> {
  const env = options.env ?? process.env;
  const roots =
    options.shortcutRoots ?? (options.platform === "win32" ? windowsStartMenuRoots(env) : []);
  const shortcuts = scanShortcuts(roots, { readTarget: options.readTarget });
  const programs = options.programs ?? (await readInstalledPrograms(options.platform));
  const storeApps = options.storeApps ?? (await loadStoreApps(options.platform));
  return matchAiApps({ shortcuts, programs, storeApps });
}

async function loadStoreApps(platform: NodeJS.Platform): Promise<StoreApp[]> {
  if (platform !== "win32" || process.platform !== "win32") return [];
  return readStartApps(platform);
}
