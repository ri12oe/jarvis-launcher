import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseStartAppsJson, type StoreApp } from "../shared/start-apps";

const execFileAsync = promisify(execFile);

/**
 * Constant argv for `powershell.exe`. `execFile` is called with `shell: false`,
 * so this is not a cmd.exe command line.
 */
export const START_APPS_ARGS = [
  "-NoProfile",
  "-NonInteractive",
  "-Command",
  "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-StartApps | ConvertTo-Json -Compress",
] as const;

/** Read-only Start menu app list. Store apps are not in `.lnk` files or Uninstall keys. */
export async function readStartApps(platform: NodeJS.Platform = process.platform): Promise<StoreApp[]> {
  if (platform !== "win32") return [];
  try {
    const { stdout } = await execFileAsync("powershell.exe", [...START_APPS_ARGS], {
      windowsHide: true,
      timeout: 20_000,
      maxBuffer: 4 * 1024 * 1024,
      shell: false,
    });
    return parseStartAppsJson(stdout);
  } catch {
    return [];
  }
}
