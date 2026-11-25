import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Clock } from "./Clock";
import { measureHudLabel } from "./measure";
import { cloneDefaultConfig, DEFAULT_HOTKEY } from "../shared/config";
import {
  clampIndex,
  clearLaunchStatus,
  footerHint,
  isLaunchStatus,
  isVoiceStatus,
  launchStatusText,
  statusAfterPublish,
  tileMatches,
  voiceStatusText,
  type GridKey,
} from "../shared/grid";
import { tileFallbackIcon } from "../shared/icons";
import { windowsExplorerPath } from "../shared/launch";
import { acceptRefreshClick, refreshControlLabel } from "../shared/refresh";
import {
  layoutHud,
  stepHud,
  viewportAboveSubtitle,
  type HudKey,
  type HudLayout,
  type RingPlacement,
  type Viewport,
} from "../shared/ring";
import { composeTiles } from "../shared/tiles";
import type { DiscoveredApp, LauncherState, LauncherTileView, VoicePhase, VoiceSnapshot } from "../shared/types";
import { voiceControlLabel } from "../shared/voice-state";
import { startMicrophone } from "./mic";

const FILTER_LIMIT = 32;

const PREVIEW_APPS: DiscoveredApp[] = [
  ["chatgpt", "ChatGPT"],
  ["claude", "Claude"],
  ["cursor", "Cursor"],
  ["grok", "Grok"],
  ["copilot", "Copilot"],
  ["perplexity", "Perplexity"],
  ["ollama", "Ollama"],
  ["lm-studio", "LM Studio"],
].map(([id, label]) => ({
  id: id as DiscoveredApp["id"],
  label,
  source: "store" as const,
  launchPath: id,
  launchKind: "store" as const,
}));

function readViewport(): Viewport {
  const width = typeof window === "undefined" ? 1366 : window.innerWidth;
  const height = typeof window === "undefined" ? 768 : window.innerHeight;
  if (width < 320 || height < 240) return { width: 1366, height: 768 };
  return { width, height };
}

function useViewport(): Viewport {
  const [viewport, setViewport] = useState(readViewport);
  useEffect(() => {
    const onResize = () => setViewport(readViewport());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return viewport;
}

function firstMatchIndex(tiles: readonly { label: string }[], query: string): number {
  const index = tiles.findIndex((tile) => tileMatches(tile.label, query));
  return index < 0 ? 0 : index;
}

function previewState(): LauncherState {
  const home = "/home/mario";
  const config = cloneDefaultConfig();
  const requested = Number(new URLSearchParams(window.location.search).get("tiles") ?? "0");
  if (requested >= 24) {
    config.extraTiles = Array.from({ length: 10 }, (_, index) => ({
      id: `module${index + 1}`,
      label: `Module ${index + 1}`,
      path: `C:\\Tools\\module-${index + 1}.exe`,
      kind: "app" as const,
    }));
  }
  const tiles = composeTiles(config, PREVIEW_APPS, {
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

const EMPTY_VOICE: VoiceSnapshot = {
  hasKey: false,
  enabled: false,
  capture: false,
  phase: "idle",
  heard: "",
  reply: "",
  error: "",
  launchError: "",
};

const PHASE_LABEL: Record<VoicePhase, string> = {
  idle: "",
  listening: "LISTENING",
  thinking: "THINKING",
  speaking: "SPEAKING",
};

function previewVoice(): VoiceSnapshot {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("voice");
  const phase =
    requested === "listening" || requested === "thinking" || requested === "speaking" ? requested : "idle";
  const hasKey = params.get("nokey") !== "1";
  return {
    hasKey,
    enabled: hasKey && params.get("off") !== "1",
    capture: false,
    phase,
    heard: params.get("heard") ?? (phase === "speaking" || phase === "thinking" ? "open projects" : ""),
    reply: params.get("reply") ?? (phase === "speaking" ? "Opening Projects." : ""),
    error: params.get("voiceError") ?? "",
    launchError: "",
  };
}

function isGridKey(key: string): key is GridKey {
  return key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown";
}

function slotStyle(place: RingPlacement): CSSProperties {
  return { "--x": `${place.x}px`, "--y": `${place.y}px` } as CSSProperties;
}

/** Decorative reactor. Idle keeps the static standby mark. The other phases are the voice states. */
function Reactor({ size, phase }: { size: number; phase: VoicePhase }) {
  const mark = phase === "idle" ? "standby" : phase;
  return (
    <div className="reactor" style={{ width: size, height: size }} aria-hidden="true">
      <div className="ticks" />
      <div className="ring ring-a" />
      <div className="ring ring-b" />
      <div className="arc arc-a" />
      <div className="arc arc-b" />
      <div className="core">
        <div className="voice" data-voice={mark} />
      </div>
    </div>
  );
}

export function App() {
  const viewport = useViewport();
  const [state, setState] = useState<LauncherState | null>(null);
  const [status, setStatus] = useState("");
  const [pressed, setPressed] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [page, setPage] = useState(0);
  const [voice, setVoice] = useState<VoiceSnapshot>(() =>
    typeof window !== "undefined" && !window.jarvis && import.meta.env.DEV ? previewVoice() : EMPTY_VOICE,
  );
  const refreshingRef = useRef(false);
  const focusFiltered = useRef(false);
  const pendingFocus = useRef<number | null>(null);
  const queryRef = useRef("");
  const activeRef = useRef(0);
  const pageRef = useRef(0);
  const tilesRef = useRef<LauncherTileView[]>([]);
  const placementsRef = useRef<RingPlacement[]>([]);
  const layoutRef = useRef<HudLayout>({ segments: [], pageCount: 1, reactor: [96] });
  const pageCountRef = useRef(1);
  const selectableRef = useRef<boolean[]>([]);
  const tileRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const launchRef = useRef<(id: string) => Promise<void>>(async () => {});
  const changePageRef = useRef<(key: HudKey, focusTile: boolean) => void>(() => {});

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
      pageRef.current = 0;
      setQuery("");
      setActiveIndex(0);
      setPage(0);
      setStatus((current) => clearLaunchStatus(current));
    });
    const stopVoice = bridge.onVoice((next) => {
      if (!cancel) setVoice(next);
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
    void bridge.getVoice().then((next) => {
      if (!cancel) setVoice(next);
    });
    return () => {
      cancel = true;
      stop();
      stopHidden();
      stopVoice();
    };
  }, []);

  useEffect(() => {
    setStatus((current) => {
      if (voice.launchError) return launchStatusText(voice.launchError);
      if (voice.error) return voiceStatusText(voice.error);
      if (isVoiceStatus(current)) return "";
      return current;
    });
  }, [voice.error, voice.launchError]);

  useEffect(() => {
    const bridge = window.jarvis;
    if (!bridge || !voice.capture) return;
    let stop = () => {};
    let cancelled = false;
    void startMicrophone((pcm) => bridge.pushAudio(pcm))
      .then((end) => {
        if (cancelled) end();
        else stop = end;
      })
      .catch(() => bridge.reportVoiceError("Microphone is unavailable"));
    return () => {
      cancelled = true;
      stop();
    };
  }, [voice.capture]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const phaseRef = useRef(voice.phase);
  const stopAudio = () => {
    const element = audioRef.current;
    if (element) {
      element.onended = null;
      element.onerror = null;
      element.pause();
    }
    audioRef.current = null;
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  };
  useEffect(() => {
    const bridge = window.jarvis;
    if (!bridge) return;
    return bridge.onSpeak((audio, contentType) => {
      stopAudio();
      const url = URL.createObjectURL(new Blob([audio], { type: contentType || "audio/mpeg" }));
      audioUrlRef.current = url;
      const element = new Audio(url);
      audioRef.current = element;
      const finish = () => {
        if (audioRef.current !== element) return;
        stopAudio();
        bridge.playbackEnded();
      };
      element.onended = finish;
      element.onerror = finish;
      void element.play().catch(finish);
    });
  }, []);
  useEffect(() => {
    const previous = phaseRef.current;
    phaseRef.current = voice.phase;
    if (previous === "speaking" && voice.phase !== "speaking") stopAudio();
  }, [voice.phase]);

  useEffect(() => {
    const dismissLaunch = () => {
      setStatus((current) => clearLaunchStatus(current));
    };
    const applyQuery = (next: string) => {
      const index = firstMatchIndex(tilesRef.current, next);
      const segment = placementsRef.current.find((place) => place.index === index);
      queryRef.current = next;
      activeRef.current = index;
      if (segment) {
        pageRef.current = segment.page;
        setPage(segment.page);
      }
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
          setQuery("");
          const index = activeRef.current;
          tileRefs.current[index]?.focus();
          return;
        }
        window.jarvis?.hide();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === "PageUp" || event.key === "PageDown") {
        event.preventDefault();
        dismissLaunch();
        changePageRef.current(event.key, true);
        return;
      }

      if (event.key === "Backspace") {
        event.preventDefault();
        dismissLaunch();
        applyQuery(queryRef.current.slice(0, -1));
        return;
      }

      if (isGridKey(event.key)) {
        event.preventDefault();
        dismissLaunch();
        const next = stepHud(
          layoutRef.current,
          { index: activeRef.current, page: pageRef.current },
          event.key,
          selectableRef.current,
        );
        activeRef.current = next.index;
        pageRef.current = next.page;
        setActiveIndex(next.index);
        setPage(next.page);
        tileRefs.current[next.index]?.focus();
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
  }, [query, page]);

  useEffect(() => {
    if (pendingFocus.current == null) return;
    const index = pendingFocus.current;
    pendingFocus.current = null;
    tileRefs.current[index]?.focus();
  }, [page, activeIndex]);

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

  const toggleVoice = () => {
    if (!voice.hasKey) return;
    const next = !voice.enabled;
    setVoice((current) => ({ ...current, enabled: next, capture: next && current.hasKey }));
    void window.jarvis?.setVoiceEnabled(next);
  };

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
  const showSubtitle = voice.phase !== "idle" || voice.heard.length > 0 || voice.reply.length > 0;
  const layoutViewport = showSubtitle ? viewportAboveSubtitle(viewport) : viewport;
  const layout = useMemo(
    () => layoutHud(tiles, layoutViewport, measureHudLabel),
    [tiles, layoutViewport.width, layoutViewport.height],
  );
  layoutRef.current = layout;
  const selectable = tiles.map((tile) => tileMatches(tile.label, query));
  const pageCount = layout.pageCount;
  const safePage = Math.min(page, Math.max(0, pageCount - 1));
  tilesRef.current = tiles;
  placementsRef.current = layout.segments;
  pageCountRef.current = pageCount;
  pageRef.current = safePage;
  selectableRef.current = selectable;
  const focusedIndex = selectable.includes(true)
    ? selectable[activeIndex]
      ? activeIndex
      : selectable.indexOf(true)
    : -1;
  if (focusedIndex >= 0 && !selectable[activeRef.current]) activeRef.current = focusedIndex;
  tileRefs.current = [];
  const warnings = state?.warnings ?? [];
  const matchCount = selectable.filter(Boolean).length;
  const hint = footerHint({
    status,
    refreshing,
    scanning: state?.scanning ?? Boolean(window.jarvis),
    refreshFailed: state?.refreshFailed ?? false,
    query,
    matchCount: query.trim() ? matchCount : undefined,
    warning: warnings[0] ?? "",
  });
  const busy = hint === "SCANNING" || hint === "REFRESHING";
  const warn = isLaunchStatus(hint) || isVoiceStatus(hint);
  const filtering = query.trim().length > 0;
  const visible = layout.segments.filter((place) => place.page === safePage);
  const reactor = layout.reactor[safePage] ?? 96;
  const orbits: Array<{ ring: number; radius: number }> = [];
  for (const place of visible) {
    if (!orbits.some((orbit) => orbit.ring === place.ring)) orbits.push({ ring: place.ring, radius: place.radius });
  }

  const changePage = (key: HudKey, focusTile: boolean) => {
    const next = stepHud(
      layout,
      { index: activeRef.current, page: pageRef.current },
      key,
      selectable,
    );
    const pageChanged = next.page !== pageRef.current;
    pageRef.current = next.page;
    activeRef.current = next.index;
    setPage(next.page);
    setActiveIndex(next.index);
    setStatus((current) => clearLaunchStatus(current));
    if (!focusTile || next.index < 0) return;
    if (pageChanged) pendingFocus.current = next.index;
    else tileRefs.current[next.index]?.focus();
  };
  changePageRef.current = changePage;

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  useEffect(() => {
    const segment = layout.segments[activeIndex];
    if (segment && segment.page !== safePage) setPage(segment.page);
  }, [activeIndex, layout.segments, safePage]);

  return (
    <div className="screen">
      <div className="beam" aria-hidden="true" />
      <div className="scanlines" aria-hidden="true" />

      <Clock />

      <main className="stage">
        {orbits.map((orbit) => (
          <div
            key={orbit.ring}
            className="orbit-anchor"
            style={{ width: orbit.radius * 2, height: orbit.radius * 2 }}
            aria-hidden="true"
          >
            <div
              className={orbit.ring === 0 ? "orbit" : "orbit orbit-outer"}
              style={orbit.ring > 1 ? { animationDuration: "110s" } : undefined}
            />
          </div>
        ))}
        <Reactor key={reactor} size={reactor} phase={voice.phase} />
        {pageCount > 1 ? (
          <div className="pager" style={{ "--reactor": `${reactor}px` } as CSSProperties}>
            <button
              type="button"
              className="arc-btn arc-prev"
              aria-label="Previous page"
              onClick={(event) => {
                changePage("PageUp", false);
                event.currentTarget.focus();
              }}
            >
              ‹
            </button>
            <p className="page-readout">
              {Array.from({ length: pageCount }, (_, index) => {
                const hit = filtering && layout.segments.some((place) => place.page === index && selectable[place.index]);
                const miss = filtering && !hit;
                return (
                  <span
                    key={index}
                    className={["page-mark", index === safePage ? "current" : "", hit ? "hit" : "", miss ? "miss" : ""]
                      .filter(Boolean)
                      .join(" ")}
                    aria-current={index === safePage ? "page" : undefined}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                );
              })}
            </p>
            <button
              type="button"
              className="arc-btn arc-next"
              aria-label="Next page"
              onClick={(event) => {
                changePage("PageDown", false);
                event.currentTarget.focus();
              }}
            >
              ›
            </button>
          </div>
        ) : null}
        <ul className="segments" aria-label="Programs">
          {visible.map((place) => {
            const tile = tiles[place.index];
            if (!tile) return null;
            const matched = selectable[place.index] === true;
            const dim = filtering && !matched;
            const active = place.index === focusedIndex;
            return (
              <li key={tile.id} className="slot" style={slotStyle(place)}>
                <button
                  type="button"
                  ref={(node) => {
                    tileRefs.current[place.index] = node;
                  }}
                  className={["tile", dim ? "dim" : "", filtering && matched ? "lit" : "", active ? "active" : "", pressed === tile.id ? "pressed" : ""]
                    .filter(Boolean)
                    .join(" ")}
                  data-kind={tile.kind}
                  data-side={place.side}
                  aria-disabled={dim || undefined}
                  tabIndex={active ? 0 : -1}
                  onFocus={() => {
                    activeRef.current = place.index;
                    setActiveIndex(place.index);
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
                  <span className="label" title={place.ellipsis ? tile.label : undefined}>
                    {tile.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </main>

      {showSubtitle ? (
        <p className="subtitle" aria-live="polite">
          {PHASE_LABEL[voice.phase] ? <span className="phase">{PHASE_LABEL[voice.phase]}</span> : null}
          {voice.heard ? <span className="heard">{voice.heard}</span> : null}
          {voice.reply ? <span className="reply">{voice.reply}</span> : null}
        </p>
      ) : null}

      <footer className="bottom">
        <p className={["hint", busy ? "busy" : "", warn ? "warn" : ""].filter(Boolean).join(" ")} aria-live="polite">
          {hint}
        </p>
        <div className="commands">
          <button
            type="button"
            className="command"
            aria-pressed={voice.hasKey ? voice.enabled : undefined}
            disabled={!voice.hasKey}
            onClick={toggleVoice}
          >
            {voiceControlLabel(voice)}
          </button>
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
