export interface StoreApp {
  name: string;
  appId: string;
}

/** Packaged app id, `PackageFamily!App`. Rejects quotes and shell metacharacters. */
const STORE_APP_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*![A-Za-z0-9][A-Za-z0-9._-]*$/;

export function isStoreAppId(value: string): boolean {
  return STORE_APP_ID.test(value);
}

/**
 * Any Start menu app id that `shell:AppsFolder\<id>` can open: packaged ids,
 * desktop ids such as `com.squirrel.figma.Figma`, and known-folder paths such
 * as `{6D809377-...}\Notepad++\notepad++.exe`. Web links, quotes, and
 * control characters are refused. The id is passed to explorer.exe as one
 * argument with no shell.
 */
const LAUNCHABLE_APP_ID = /^[A-Za-z0-9{][A-Za-z0-9 ._\-!{}\\:()+#,&]{0,259}$/;

export function isLaunchableAppId(value: string): boolean {
  return LAUNCHABLE_APP_ID.test(value) && !/^[a-z][a-z0-9+.-]*:\/\//i.test(value) && !value.includes("..");
}

/**
 * Parse `Get-StartApps | ConvertTo-Json` output.
 * PowerShell emits one object when there is a single app, and an array otherwise.
 * By default only packaged (Store) apps are kept, for the tiles. Voice "open"
 * passes isLaunchableAppId to keep desktop apps too.
 */
export function parseStartAppsJson(output: string, accept: (appId: string) => boolean = isStoreAppId): StoreApp[] {
  const text = output.replace(/^\uFEFF/, "").trim();
  if (!text) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (parsed === null || parsed === undefined) return [];
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  const apps: StoreApp[] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const record = row as Record<string, unknown>;
    const name = typeof record.Name === "string" ? record.Name.trim() : "";
    const appId = typeof record.AppID === "string" ? record.AppID.trim() : "";
    if (!name || !accept(appId)) continue;
    apps.push({ name, appId });
  }
  return apps;
}
