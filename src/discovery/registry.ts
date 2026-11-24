import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { InstalledProgram } from "../shared/types";

const execFileAsync = promisify(execFile);

/**
 * Uninstall listing keys only. These are read with `reg query` and never written.
 * Shell, Winlogon, and Explorer policy keys are intentionally not in this list.
 */
export const UNINSTALL_KEYS = [
  "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
  "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
  "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
] as const;

/**
 * Pull an exe path out of a DisplayIcon value such as
 * `"C:\\App\\app.exe",0` or `C:\\App\\app.exe,0`.
 * UninstallString is deliberately not accepted: it points at uninstallers.
 */
export function exeFromDisplayIcon(value: string | undefined): string | undefined {
  if (!value) return undefined;
  let text = value.trim();
  if (text.startsWith('"')) {
    const end = text.indexOf('"', 1);
    if (end > 1) text = text.slice(1, end);
  }
  text = text.replace(/,\s*-?\d+\s*$/, "").trim();
  if (!/\.exe$/i.test(text)) return undefined;
  if (!/^[A-Za-z]:[\\/]/.test(text) && !text.startsWith("\\\\")) return undefined;
  return text;
}

/**
 * Parse `reg query <key> /s` output. Only DisplayName and DisplayIcon are kept.
 */
export function parseUninstallListing(output: string): InstalledProgram[] {
  const programs: InstalledProgram[] = [];
  const blocks = output.split(/\r?\n(?=HKEY_)/);

  for (const block of blocks) {
    if (!/^HKEY_/i.test(block)) continue;
    let name: string | undefined;
    let icon: string | undefined;
    for (const line of block.split(/\r?\n/)) {
      const match = /^\s{2,}(DisplayName|DisplayIcon)\s+REG_\w+\s+(.*)$/i.exec(line);
      if (!match) continue;
      const key = match[1].toLowerCase();
      const value = match[2].trim();
      if (key === "displayname") name = value;
      if (key === "displayicon") icon = value;
    }
    if (!name) continue;
    programs.push({ name, exePath: exeFromDisplayIcon(icon) });
  }
  return programs;
}

async function queryKey(key: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("reg", ["query", key, "/s"], {
      windowsHide: true,
      timeout: 20_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    return stdout;
  } catch {
    return "";
  }
}

/** Read-only uninstall inventory. Returns nothing off Windows or when `reg` fails. */
export async function readInstalledPrograms(platform: NodeJS.Platform = process.platform): Promise<InstalledProgram[]> {
  if (platform !== "win32") return [];
  const chunks = await Promise.all(UNINSTALL_KEYS.map((key) => queryKey(key)));
  const programs: InstalledProgram[] = [];
  for (const chunk of chunks) {
    programs.push(...parseUninstallListing(chunk));
  }
  return programs;
}
