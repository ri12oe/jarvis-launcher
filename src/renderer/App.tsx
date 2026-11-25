import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cloneDefaultConfig, DEFAULT_HOTKEY } from "../shared/config";
import {
  clampIndex,
  clearLaunchStatus,
  footerHint,
  launchStatusText,
  statusAfterPublish,
  tileMatches,
  type GridKey,
} from "../shared/grid";
import { tileFallbackIcon } from "../shared/icons";
import { windowsExplorerPath } from "../shared/launch";
import { acceptRefreshClick, refreshControlLabel } from "../shared/refresh";
import { nextRingTile, placeTiles, type RingPlacement } from "../shared/ring";
import { composeTiles } from "../shared/tiles";
import type { DiscoveredApp, LauncherState, LauncherTileView } from "../shared/types";

const FILTER_LIMIT = 32;

function formatClock(date: Date): string {
  return date.toLocaleTimeString("en-GB", { hour12: false });
}

function formatDate(date: Date): string {
  return date
    .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    .toUpperCase();
}

function firstMatchIndex(tiles: readonly { label: string }[], query: string): number {
  const index = tiles.findIndex((tile) => tileMatches(tile.label, query));
  return index < 0 ? 0 : index;
}

function previewState(): LauncherState {
  const home = "/home/mario";
  const discovered: DiscoveredApp[] = [
    { id: "chatgpt", label: "ChatGPT", source: "store", launchPath: "chatgpt", launchKind: "store" },
    { id: "claude", label: "Claude", source: "store", launchPath: "claude", launchKind: "store" },
    { id: "cursor", label: "Cursor", source: "store", launchPath: "cursor", launchKind: "store" },
    { id: "grok", label: "Grok", source: "store", launchPath: "grok", launchKind: "store" },
  ];
  const tiles = composeTiles(cloneDefaultConfig(), discovered, {
    platform: "linux",
    edgeExecutables: [],
    explorerPath: windowsExplorerPath(),
    folders: {
      desktop: `${home}/Desktop`,
      documents: `${home}/Documents`,
      downloads: `${home}/Downloads`,
      pictures: `${home}/Pictures`,
    },
  });
  return {
    hotkey: DEFAULT_HOTKEY,
    platform: "linux",
    tiles: tiles.map((tile) => {
      const icon = tileFallbackIcon(tile);
      return icon
        ? { id: tile.id, label: tile.label, kind: tile.kind, icon }
        : { id: tile.id, label: tile.label, kind: tile.kind };
    }),
    warnings: [],
    scanning: false,
    refreshFailed: false,
  };
}

function isGridKey(key: string): key is GridKey {
  return key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown";
}

function slotStyle(place: RingPlacement): CSSProperties {
  return { "--x": place.x, "--y": place.y } as CSSProperties;
}

/** Decorative reactor. The center mark is reserved for a future voice indicator. */
function Reactor() {
  return (
    <div className="reactor" aria-hidden="true">
      <div className="ticks" />
      <div className="ring ring-a" />
      <div className="ring ring-b" />
      <div className="arc arc-a" />
      <div className="arc arc-b" />
      <div className="core">
        <div className="voice" data-voice="standby" />
      </div>
    </div>
  );
}

export function App() {
  const [state, setState] = useState<LauncherState | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [status, setStatus] = useState("");
  const [pressed, setPressed] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const refreshingRef = useRef(false);
  const focusFiltered = useRef(false);
  const queryRef = useRef("");
  const activeRef = useRef(0);
  const tilesRef = useRef<LauncherTileView[]>([]);
  const placementsRef = useRef<RingPlacement[]>([]);
  const selectableRef = useRef<boolean[]>([]);
  const tileRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const launchRef = useRef<(id: string) => Promise<void>>(async () => {});

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancel = false;
    const bridge = window.jarvis;
    if (!bridge) {
      if (import.meta.env.DEV) setState(previewState());
      else setStatus("LINK LOST");
      return () => {
        cancel = true;
      };
    }
    let pushed = false;
    const apply = (next: LauncherState) => {
      if (cancel) return;
      setState(next);
      setStatus((current) => statusAfterPublish(current, next.refreshFailed));
    };
    const stop = bridge.onState((next) => {
      pushed = true;
      apply(next);
    });
    const stopHidden = bridge.onHidden(() => {
      if (cancel) return;
      queryRef.current = "";
      activeRef.current = 0;
      setQuery("");
      setActiveIndex(0);
      setStatus((current) => clearLaunchStatus(current));
    });
    void bridge
      .getState()
      .then((next) => {
        if (pushed) return;
        apply(next);
      })
      .catch(() => {
        if (!cancel) setStatus("LINK LOST");
      });
    return () => {
      cancel = true;
      stop();
      stopHidden();
    };
  }, []);

  useEffect(() => {
    const dismissLaunch = () => {
      setStatus((current) => clearLaunchStatus(current));
    };
    const applyQuery = (next: string) => {
      const index = firstMatchIndex(tilesRef.current, next);
      queryRef.current = next;
      activeRef.current = index;
      focusFiltered.current = true;
      setQuery(next);
      setActiveIndex(index);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if (event.key === "Escape") {
        dismissLaunch();
        if (queryRef.current) {
          queryRef.current = "";
          activeRef.current = 0;
          setQuery("");
          setActiveIndex(0);
          return;
        }
        window.jarvis?.hide();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === "Backspace") {
        event.preventDefault();
        dismissLaunch();
        applyQuery(queryRef.current.slice(0, -1));
        return;
      }

      if (isGridKey(event.key)) {
        event.preventDefault();
        dismissLaunch();
        const next = nextRingTile(activeRef.current, placementsRef.current, event.key, selectableRef.current);
        if (next < 0) return;
        activeRef.current = next;
        setActiveIndex(next);
        tileRefs.current[next]?.focus();
        return;
      }

      if (event.key === "Enter") {
        const target = event.target;
        if (target instanceof HTMLElement && target.closest("button")) return;
        const index = activeRef.current;
        if (!selectableRef.current[index]) return;
        const tile = tilesRef.current[index];
        if (!tile) return;
        event.preventDefault();
        void launchRef.current(tile.id);
        return;
      }

      if (event.key.length !== 1) return;
      if (event.key === " " && event.target instanceof HTMLElement && event.target.closest("button")) return;
      event.preventDefault();
      dismissLaunch();
      applyQuery((queryRef.current + event.key).slice(0, FILTER_LIMIT));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!focusFiltered.current) return;
    focusFiltered.current = false;
    const index = activeRef.current;
    if (!selectableRef.current[index]) return;
    tileRefs.current[index]?.focus();
  }, [query]);

  useEffect(() => {
    const list = state?.tiles ?? [];
    if (list.length === 0) return;
    const index = clampIndex(activeIndex, list.length);
    if (!tileMatches(list[index]?.label ?? "", query)) {
      const next = list.findIndex((tile) => tileMatches(tile.label, query));
      if (next < 0 || next === activeIndex) return;
      activeRef.current = next;
      setActiveIndex(next);
      return;
    }
    if (index !== activeIndex) {
      activeRef.current = index;
      setActiveIndex(index);
    }
  }, [state, query, activeIndex]);

  const launch = async (id: string) => {
    setPressed(id);
    window.setTimeout(() => setPressed((current) => (current === id ? null : current)), 220);
    setStatus((current) => clearLaunchStatus(current));
    const bridge = window.jarvis;
    if (!bridge) return;
    const result = await bridge.launch(id);
    if (!result.ok) setStatus(launchStatusText(result.error));
  };
  launchRef.current = launch;

  const refresh = () => {
    if (!acceptRefreshClick(refreshingRef.current)) return;
    const bridge = window.jarvis;
    if (!bridge) return;
    refreshingRef.current = true;
    setRefreshing(true);
    setStatus((current) => clearLaunchStatus(current));
    void bridge
      .refresh()
      .catch(() => {
        setStatus((current) => current || "REFRESH FAILED");
      })
      .finally(() => {
        refreshingRef.current = false;
        setRefreshing(false);
      });
  };

  const tiles = state?.tiles ?? [];
  const placements = placeTiles(tiles);
  const selectable = tiles.map((tile) => tileMatches(tile.label, query));
  tilesRef.current = tiles;
  placementsRef.current = placements;
  selectableRef.current = selectable;
  const focusedIndex = selectable.includes(true)
    ? selectable[activeIndex]
      ? activeIndex
      : selectable.indexOf(true)
    : -1;
  if (focusedIndex >= 0 && !selectable[activeRef.current]) activeRef.current = focusedIndex;
  tileRefs.current = [];
  const warnings = state?.warnings ?? [];
  const hint = footerHint({
    status,
    refreshing,
    scanning: state?.scanning ?? Boolean(window.jarvis),
    refreshFailed: state?.refreshFailed ?? false,
    query,
    warning: warnings[0] ?? "",
  });
  const busy = hint === "SCANNING" || hint === "REFRESHING";
  const filtering = query.trim().length > 0;
  const innerRadius = placements.reduce((min, place) => Math.min(min, place.radius), 0);
  const coreScale = innerRadius > 0 ? innerRadius * 1.2 : 1.2;
  const orbits: Array<{ ring: 0 | 1; radius: number }> = [];
  for (const place of placements) {
    if (!orbits.some((orbit) => orbit.ring === place.ring)) orbits.push({ ring: place.ring, radius: place.radius });
  }

  return (
    <div className="screen">
      <div className="beam" aria-hidden="true" />
      <div className="scanlines" aria-hidden="true" />

      <aside className="side">
        <p className="mark">JARVIS</p>
        <time dateTime={now.toISOString()}>
          <span className="clock">{formatClock(now)}</span>
          <span className="date">{formatDate(now)}</span>
        </time>
      </aside>

      <main className="stage" style={{ "--core": coreScale } as CSSProperties}>
        {orbits.map((orbit) => (
          <div
            key={orbit.ring}
            className={orbit.ring === 0 ? "orbit orbit-inner" : "orbit orbit-outer"}
            style={{ "--d": orbit.radius * 2 } as CSSProperties}
            aria-hidden="true"
          />
        ))}
        <Reactor />
        <ul className="segments" aria-label="Programs">
          {tiles.map((tile, index) => {
            const place = placements[index];
            if (!place) return null;
            const matched = selectable[index] === true;
            const dim = filtering && !matched;
            const active = index === focusedIndex;
            return (
              <li key={tile.id} className="slot" style={slotStyle(place)}>
                <button
                  type="button"
                  ref={(node) => {
                    tileRefs.current[index] = node;
                  }}
                  className={["tile", dim ? "dim" : "", filtering && matched ? "lit" : "", active ? "active" : "", pressed === tile.id ? "pressed" : ""]
                    .filter(Boolean)
                    .join(" ")}
                  data-kind={tile.kind}
                  data-side={place.side}
                  aria-disabled={dim || undefined}
                  tabIndex={active ? 0 : -1}
                  onFocus={() => {
                    activeRef.current = index;
                    setActiveIndex(index);
                  }}
                  onClick={() => {
                    if (!tileMatches(tile.label, query)) return;
                    void launch(tile.id);
                  }}
                >
                  <span className="icon-ring">
                    {tile.icon ? (
                      <img className="icon" alt="" draggable={false} src={tile.icon} />
                    ) : (
                      <span className={`glyph glyph-${tile.kind}`} />
                    )}
                  </span>
                  <span className="label">{tile.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </main>

      <footer className="bottom">
        <p className={busy ? "hint busy" : "hint"} aria-live="polite">
          {hint}
        </p>
        <div className="commands">
          <button
            type="button"
            className={refreshing ? "command refreshing" : "command"}
            aria-busy={refreshing}
            onClick={refresh}
          >
            {refreshControlLabel(refreshing)}
          </button>
          <button type="button" className="command" onClick={() => window.jarvis?.quit()}>
            QUIT
          </button>
        </div>
      </footer>

      <div className="boot" aria-hidden="true">
        <p className="boot-kicker">UPLINK</p>
        <p className="boot-title">JARVIS</p>
        <p className="boot-line line-a">REACTOR</p>
        <p className="boot-line line-b">ONLINE</p>
      </div>
    </div>
  );
}
