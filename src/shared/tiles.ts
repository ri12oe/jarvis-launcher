import { planBuiltinLaunch, planDiscoveredLaunch, planExtraLaunch } from "./launch";
import type { LaunchEnvironment } from "./launch";
import type { BuiltinId, DiscoveredApp, JarvisConfig, ResolvedTile, TileKind } from "./types";
import { BUILTIN_IDS } from "./types";
import type { WebTileId } from "./types";

const BUILTIN_LABELS: Record<BuiltinId, string> = {
  edge: "Microsoft Edge",
  explorer: "File Explorer",
  desktop: "Desktop",
  documents: "Documents",
  downloads: "Downloads",
  pictures: "Pictures",
};

const BUILTIN_KINDS: Record<BuiltinId, TileKind> = {
  edge: "app",
  explorer: "system",
  desktop: "folder",
  documents: "folder",
  downloads: "folder",
  pictures: "folder",
};

interface WebTile {
  id: WebTileId;
  label: string;
  url: string;
  /** Left out when this desktop app was discovered. */
  unless?: DiscoveredApp["id"];
}

/** Slots in the HUD that still work when the desktop app is missing. */
export const WEB_TILES: readonly WebTile[] = [
  { id: "gemini-web", label: "Gemini", url: "https://gemini.google.com/", unless: "gemini" },
  { id: "github-web", label: "GitHub", url: "https://github.com/", unless: "github" },
  { id: "x", label: "X", url: "https://x.com/" },
  { id: "google", label: "Google", url: "https://www.google.com/" },
];

export function composeTiles(
  config: JarvisConfig,
  discovered: readonly DiscoveredApp[],
  env: LaunchEnvironment,
): ResolvedTile[] {
  const tiles: ResolvedTile[] = [];
  const seen = new Set<string>();

  const push = (tile: ResolvedTile) => {
    if (seen.has(tile.id) || config.disabled.includes(tile.id)) return;
    seen.add(tile.id);
    const override = config.labels[tile.id];
    tiles.push(override ? { ...tile, label: override } : tile);
  };

  for (const app of discovered) {
    push({
      id: app.id,
      label: app.label,
      kind: "app",
      action: planDiscoveredLaunch(app, env.explorerPath),
    });
  }

  for (const builtin of BUILTIN_IDS) {
    push({
      id: builtin,
      label: BUILTIN_LABELS[builtin],
      kind: BUILTIN_KINDS[builtin],
      action: planBuiltinLaunch(builtin, env),
    });
  }

  const found = new Set(discovered.map((app) => app.id));
  for (const web of WEB_TILES) {
    if (web.unless && found.has(web.unless)) continue;
    push({ id: web.id, label: web.label, kind: "app", action: { type: "openExternal", url: web.url } });
  }

  for (const folder of config.pinnedFolders) {
    push({
      id: folder.id,
      label: folder.label,
      kind: "folder",
      action: planExtraLaunch(folder),
    });
  }

  for (const extra of config.extraTiles) {
    push({
      id: extra.id,
      label: extra.label,
      kind: extra.kind === "folder" ? "folder" : "app",
      action: planExtraLaunch(extra),
    });
  }

  if (config.order.length === 0) return tiles;

  const rank = new Map(config.order.map((id, index) => [id, index]));
  return tiles
    .map((tile, index) => ({ tile, index }))
    .sort((a, b) => {
      const ar = rank.has(a.tile.id) ? rank.get(a.tile.id)! : Number.MAX_SAFE_INTEGER;
      const br = rank.has(b.tile.id) ? rank.get(b.tile.id)! : Number.MAX_SAFE_INTEGER;
      if (ar !== br) return ar - br;
      return a.index - b.index;
    })
    .map((entry) => entry.tile);
}
