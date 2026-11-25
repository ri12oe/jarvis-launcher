import { useEffect, useRef, useState } from "react";
import { cloneDefaultConfig, DEFAULT_HOTKEY } from "../shared/config";
import { columnCountFromOffsets, filterTiles, footerHint, nextGridIndex, type GridKey } from "../shared/grid";
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
      setStatus((current) => {
        if (current === "LAUNCH FAILED") return current;
        if (current === "REFRESH FAILED" && next.refreshFailed) return current;
        return "";
      });
    };
    const stop = bridge.onState((next) => {
      pushed = true;
      apply(next);
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
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if (event.key === "Escape") {
        queryRef.current = "";
        setQuery("");
        window.jarvis?.hide();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === "Backspace") {
        event.preventDefault();
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
        const visible = visibleRef.current;
        const offsets = [...(listRef.current?.children ?? [])].map((node) => (node as HTMLElement).offsetTop);
        const columns = columnCountFromOffsets(offsets);
        const next = nextGridIndex(activeRef.current, visible.length, columns, event.key);
        activeRef.current = next;
        setActiveIndex(next);
        if (next >= 0) tileRefs.current[next]?.focus();
        return;
      }

      if (event.key === "Enter") {
        const target = event.target;
        if (target instanceof HTMLElement && target.closest("button")) return;
        const tile = visibleRef.current[activeRef.current] ?? visibleRef.current[0];
        if (!tile) return;
        event.preventDefault();
        void launchRef.current(tile.id);
        return;
      }

      if (event.key.length !== 1) return;
      event.preventDefault();
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

  const launch = async (id: string) => {
    setPressed(id);
    window.setTimeout(() => setPressed((current) => (current === id ? null : current)), 220);
    const bridge = window.jarvis;
    if (!bridge) return;
    const result = await bridge.launch(id);
    if (!result.ok) {
      setStatus(result.error ?? "LAUNCH FAILED");
      return;
    }
    bridge.hide();
  };
  launchRef.current = launch;

  const refresh = () => {
    if (!acceptRefreshClick(refreshingRef.current)) return;
    const bridge = window.jarvis;
    if (!bridge) return;
    refreshingRef.current = true;
    setRefreshing(true);
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
                tabIndex={index === activeIndex ? 0 : -1}
                onFocus={() => {
                  activeRef.current = index;
                  setActiveIndex(index);
                }}
                onClick={() => void launch(tile.id)}
              >
                <span className="kind">
                  {tile.icon ? <img className="icon" alt="" src={tile.icon} /> : null}
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
