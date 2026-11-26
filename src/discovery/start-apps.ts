import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseStartAppsJson, type StoreApp } from "../shared/start-apps";

const execFileAsync = promisify(execFile);

/**
 * Constant argv for Windows PowerShell. `execFile` is called with `shell: false`,
 * so this is not a cmd.exe command line.
 */
export const START_APPS_ARGS = [
  "-NoProfile",
  "-NonInteractive",
  "-Command",
  "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-StartApps | ConvertTo-Json -Compress",
] as const;

export const START_APPS_FAILURE = "Could not list Start menu apps";

/**
 * Windows PowerShell 5.1 by full path. `execFile` does not expand `%SystemRoot%`
 * and does not search PATH.
 */
export function windowsPowershellPath(systemRoot?: string): string {
  const root = systemRoot?.trim() ? systemRoot.trim().replace(/[\\/]+$/, "") : "C:\\Windows";
  return `${root}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
}

export interface StartAppsRead {
  apps: StoreApp[];
  warning?: string;
}

interface StartAppsRunOptions {
  encoding: "utf8";
  windowsHide: boolean;
  timeout: number;
  maxBuffer: number;
  shell: false;
}

interface StartAppsRunner {
  (file: string, args: string[], options: StartAppsRunOptions): Promise<{ stdout: string }>;
}

const runPowerShell: StartAppsRunner = async (file, args, options) => {
  const { stdout } = await execFileAsync(file, args, options);
  return { stdout: String(stdout) };
};

/** Read-only Start menu app list. Store apps are not in `.lnk` files or Uninstall keys. */
export async function readStartApps(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  run: StartAppsRunner = runPowerShell,
  accept?: (appId: string) => boolean,
): Promise<StartAppsRead> {
  if (platform !== "win32") return { apps: [] };
  try {
    const { stdout } = await run(windowsPowershellPath(env.SystemRoot), [...START_APPS_ARGS], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 20_000,
      maxBuffer: 4 * 1024 * 1024,
      shell: false,
    });
    return { apps: parseStartAppsJson(stdout, accept) };
  } catch {
    return { apps: [], warning: START_APPS_FAILURE };
  }
}
