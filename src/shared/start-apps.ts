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
 * Parse `Get-StartApps | ConvertTo-Json` output.
 * PowerShell emits one object when there is a single app, and an array otherwise.
 */
export function parseStartAppsJson(output: string): StoreApp[] {
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
    if (!name || !isStoreAppId(appId)) continue;
    apps.push({ name, appId });
  }
  return apps;
}
