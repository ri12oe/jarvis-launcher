import { useEffect, useRef, useState } from "react";
import { cloneDefaultConfig, DEFAULT_HOTKEY } from "../shared/config";
import {
  clampIndex,
  clearLaunchStatus,
  filterTiles,
  footerHint,
  launchStatusText,
  nextVisibleTile,
  statusAfterPublish,
  type GridKey,
  type TilePoint,
} from "../shared/grid";
import { tileFallbackIcon } from "../shared/icons";
import { windowsExplorerPath } from "../shared/launch";
import { acceptRefreshClick, refreshControlLabel } from "../shared/refresh";
import { composeTiles } from "../shared/tiles";
import type { LauncherState, LauncherTileView, TileKind } from "../shared/types";

const FILTER_LIMIT = 32;

function formatHotkey(hotkey: string): string {
  const names: Record<string, string> = {
    CommandOrControl: "CTRL",
    Command: "CMD",
    Cmd: "CMD",
    Control: "CTRL",
    Ctrl: "CTRL",
    Alt: "ALT",
    Option: "ALT",
    AltGr: "ALT",
    Shift: "SHIFT",
    Super: "SUPER",
    Meta: "META",
  };
  return hotkey
    .split("+")
    .map((part) => names[part] ?? part.toUpperCase())
    .join("  +  ");
}

function formatClock(date: Date): string {
  return date.toLocaleTimeString("en-GB", { hour12: false });
}

function previewState(): LauncherState {
  const home = "/home/mario";
  const tiles = composeTiles(cloneDefaultConfig(), [], {
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

const KIND_LABEL: Record<TileKind, string> = {
  app: "APP",
  folder: "FOLDER",
  system: "SYSTEM",
};

function isGridKey(key: string): key is GridKey {
  return key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown";
}

function tilePoints(list: HTMLElement | null): TilePoint[] {
  return [...(list?.children ?? [])].map((node) => {
    const rect = (node as HTMLElement).getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
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
  const visibleRef = useRef<LauncherTileView[]>([]);
  const listRef = useRef<HTMLUListElement | null>(null);
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
        const next = queryRef.current.slice(0, -1);
        queryRef.current = next;
        activeRef.current = 0;
        focusFiltered.current = true;
        setQuery(next);
        setActiveIndex(0);
        return;
      }

      if (isGridKey(event.key)) {
        event.preventDefault();
        dismissLaunch();
        const visible = visibleRef.current;
        const points = tilePoints(listRef.current);
        const current = clampIndex(activeRef.current, visible.length);
        const next = nextVisibleTile(current, points, event.key);
        activeRef.current = next;
        setActiveIndex(next < 0 ? 0 : next);
        if (next >= 0) tileRefs.current[next]?.focus();
        return;
      }

      if (event.key === "Enter") {
        const target = event.target;
        if (target instanceof HTMLElement && target.closest("button")) return;
        const visible = visibleRef.current;
        const tile = visible[clampIndex(activeRef.current, visible.length)];
        if (!tile) return;
        event.preventDefault();
        void launchRef.current(tile.id);
        return;
      }

      if (event.key.length !== 1) return;
      if (event.key === " " && event.target instanceof HTMLElement && event.target.closest("button")) return;
      event.preventDefault();
      dismissLaunch();
      const next = (queryRef.current + event.key).slice(0, FILTER_LIMIT);
      queryRef.current = next;
      activeRef.current = 0;
      focusFiltered.current = true;
      setQuery(next);
      setActiveIndex(0);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!focusFiltered.current) return;
    focusFiltered.current = false;
    tileRefs.current[0]?.focus();
  }, [query]);

  useEffect(() => {
    const count = filterTiles(state?.tiles ?? [], query).length;
    if (count > 0 && activeIndex >= count) {
      const next = count - 1;
      activeRef.current = next;
      setActiveIndex(next);
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

  const hotkey = formatHotkey(state?.hotkey ?? DEFAULT_HOTKEY);
  const tiles = state?.tiles ?? [];
  const visible = filterTiles(tiles, query);
  visibleRef.current = visible;
  const focusedIndex = clampIndex(activeIndex, visible.length);
  if (activeRef.current >= visible.length) activeRef.current = focusedIndex;
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

  return (
    <div className="screen">
      <div className="hud" aria-hidden="true">
        <div className="ring ring-a" />
        <div className="ring ring-b" />
        <div className="ring ring-c" />
        <div className="arc arc-a" />
        <div className="arc arc-b" />
        <div className="core" />
      </div>
      <div className="beam" aria-hidden="true" />
      <div className="scanlines" aria-hidden="true" />

      <header className="top">
        <div>
          <p className="mark">JARVIS</p>
          <p className="hint">OVERLAY  ·  {hotkey}</p>
        </div>
        <time dateTime={now.toISOString()}>{formatClock(now)}</time>
      </header>

      <main className="stage">
        <ul className="tiles" ref={listRef}>
          {visible.map((tile, index) => (
            <li key={tile.id}>
              <button
                type="button"
                ref={(node) => {
                  tileRefs.current[index] = node;
                }}
                className={pressed === tile.id ? "tile pressed" : "tile"}
                data-kind={tile.kind}
                tabIndex={visible.length > 0 && index === focusedIndex ? 0 : -1}
                onFocus={() => {
                  activeRef.current = index;
                  setActiveIndex(index);
                }}
                onClick={() => void launch(tile.id)}
              >
                <span className="kind">
                  {tile.icon ? (
                    <span className="icon-ring">
                      <img className="icon" alt="" src={tile.icon} />
                    </span>
                  ) : null}
                  {KIND_LABEL[tile.kind]}
                </span>
                <span className="label">{tile.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </main>

      <footer className="bottom">
        <p className="hint">{hint}</p>
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
        <p className="boot-line line-a">SENSORS</p>
        <p className="boot-line line-b">ONLINE</p>
      </div>
    </div>
  );
}
