import { matchAiApps } from "../shared/match";
import type { StoreApp } from "../shared/start-apps";
import type { DiscoveredApp, InstalledProgram } from "../shared/types";
import { readInstalledPrograms } from "./registry";
import { readStartApps, type StartAppsRead } from "./start-apps";
import { scanShortcuts, windowsStartMenuRoots } from "./shortcuts";

export interface DiscoveryResult {
  apps: DiscoveredApp[];
  warnings: string[];
}

export async function discoverInstalledApps(options: {
  platform: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  /** Overrides the start-menu roots. Tests pass a temp directory here. */
  shortcutRoots?: readonly string[];
  readTarget?: (lnkPath: string) => string | undefined;
  programs?: InstalledProgram[];
  /** Pass this in tests. Omitted on a real Windows host, where Get-StartApps runs. */
  storeApps?: readonly StoreApp[];
  /** Test hook for a canned Get-StartApps result, including a failure warning. */
  readStoreApps?: () => Promise<StartAppsRead>;
}): Promise<DiscoveryResult> {
  const env = options.env ?? process.env;
  const roots =
    options.shortcutRoots ?? (options.platform === "win32" ? windowsStartMenuRoots(env) : []);
  const shortcuts = scanShortcuts(roots, { readTarget: options.readTarget });
  const programs = options.programs ?? (await readInstalledPrograms(options.platform));
  const storeRead = await resolveStoreApps(options);
  const warnings = storeRead.warning ? [storeRead.warning] : [];
  return { apps: matchAiApps({ shortcuts, programs, storeApps: storeRead.apps }), warnings };
}

async function resolveStoreApps(options: {
  platform: NodeJS.Platform;
  storeApps?: readonly StoreApp[];
  readStoreApps?: () => Promise<StartAppsRead>;
}): Promise<StartAppsRead> {
  if (options.storeApps) return { apps: [...options.storeApps] };
  if (options.readStoreApps) return options.readStoreApps();
  // readStartApps checks the platform argument. This checks the OS so a Linux
  // test that passes platform "win32" stays on the fixture data.
  if (process.platform !== "win32") return { apps: [] };
  return readStartApps(options.platform);
}
