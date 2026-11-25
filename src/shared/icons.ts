import type { ResolvedTile } from "./types";

/** HUD mark for a tile that has no file to pass to `app.getFileIcon`. */
export const PLACEHOLDER_ICON = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="1.5" width="13" height="13" stroke="#5cf6ff" stroke-width="1.2"/><circle cx="8" cy="8" r="1.5" fill="#5cf6ff"/></svg>',
)}`;

/** Filesystem path whose icon represents this tile, when there is one. */
export function tileIconFile(tile: ResolvedTile): string | undefined {
  if (tile.action.type === "openPath") return tile.action.path;
  if (tile.id === "explorer" && tile.action.type === "spawn") return tile.action.command;
  return undefined;
}

/**
 * Store apps launch through `shell:AppsFolder` and have no logo path.
 * `Get-StartApps` returns a name and an app id. The package logo is under
 * `WindowsApps`, which a normal account cannot read, so the placeholder stays.
 * The Edge protocol is only used when `msedge.exe` was not found.
 */
export function tileFallbackIcon(tile: ResolvedTile): string | undefined {
  if (tile.action.type === "openExternal" && tile.action.url === "microsoft-edge:") return PLACEHOLDER_ICON;
  if (tile.action.type === "spawn" && tile.action.args.some((arg) => arg.startsWith("shell:AppsFolder\\"))) {
    return PLACEHOLDER_ICON;
  }
  return undefined;
}
