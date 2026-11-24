import { useEffect, useState } from "react";
import { cloneDefaultConfig, DEFAULT_HOTKEY } from "../shared/config";
import { composeTiles } from "../shared/tiles";
import type { LauncherState, TileKind } from "../shared/types";

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
    tiles: tiles.map(({ id, label, kind }) => ({ id, label, kind })),
    warnings: [],
  };
}

const KIND_LABEL: Record<TileKind, string> = {
  app: "APP",
  folder: "FOLDER",
  system: "SYSTEM",
};

export function App() {
  const [state, setState] = useState<LauncherState | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [status, setStatus] = useState("");
  const [pressed, setPressed] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancel = false;
    const load = async () => {
      try {
        const bridge = window.jarvis;
        const next = bridge ? await bridge.getState() : previewState();
        if (!cancel) {
          setState(next);
          setStatus("");
        }
      } catch {
        if (!cancel) setStatus("LINK LOST");
      }
    };
    void load();
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancel = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") window.jarvis?.hide();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  const hotkey = formatHotkey(state?.hotkey ?? DEFAULT_HOTKEY);
  const tiles = state?.tiles ?? [];
  const warnings = state?.warnings ?? [];

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
        <div className="tiles" role="list">
          {tiles.map((tile) => (
            <button
              key={tile.id}
              type="button"
              role="listitem"
              className={pressed === tile.id ? "tile pressed" : "tile"}
              data-kind={tile.kind}
              onClick={() => void launch(tile.id)}
            >
              <span className="kind">{KIND_LABEL[tile.kind]}</span>
              <span className="label">{tile.label}</span>
            </button>
          ))}
        </div>
      </main>

      <footer className="bottom">
        <p className="hint">
          {status || (warnings.length > 0 ? warnings[0] : "SELECT A SYSTEM")}
        </p>
        <button type="button" className="quit" onClick={() => window.jarvis?.quit()}>
          QUIT
        </button>
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
