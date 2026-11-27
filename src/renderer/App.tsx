import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { cloneDefaultConfig, DEFAULT_HOTKEY } from "../shared/config";
import {
  clearLaunchStatus,
  footerHint,
  isLaunchStatus,
  isVoiceStatus,
  launchStatusText,
  statusAfterPublish,
  voiceStatusText,
} from "../shared/grid";
import { tileFallbackIcon } from "../shared/icons";
import { iconForTile } from "../shared/hud-icons";
import { HudIcon } from "./mario/HudIcon";
import { FitText } from "./mario/FitText";
import { windowsExplorerPath } from "../shared/launch";
import {
  fitCanvas,
  firstFocus,
  layoutMario,
  resolveHudSlots,
  plateAngle,
  REACTOR,
  slotMatches,
  stepMario,
  type Focus,
  type PlacedSlot,
  type StepKey,
} from "../shared/mario";
import { acceptRefreshClick } from "../shared/refresh";
import {
  confirmText,
  powerClick,
  type SystemState,
  type PendingPower,
  type PowerAction,
  type SystemAction,
} from "../shared/system";
import { composeTiles } from "../shared/tiles";
import type {
  DiscoveredApp,
  LauncherState,
  LauncherTileView,
  VoicePhase,
  VoiceSnapshot,
} from "../shared/types";
import { missingBridgeMethods } from "../shared/types";
import { NowProvider } from "./hud/time";
import { Chassis } from "./mario/Chassis";
import { useBattery, useRecent, useStats, useSystem } from "./mario/live";
import { MessageLog, type LogEntry } from "./mario/MessageLog";
import {
  AnalogClock,
  DayBlock,
  DesktopClock,
  Dock,
  Gauges,
  Identity,
  LeftList,
  LevelMeter,
  MediaBar,
  VolumeKnobs,
  RamBin,
  SystemButtons,
  Telemetry,
  WeatherPanel,
} from "./mario/Panels";
import { Reactor, type PlateState } from "./mario/Reactor";
import { Motion } from "./mario/Motion";
import { isMotionMode, type MotionMode } from "../shared/motion";
import { SettingsPanel } from "./mario/Settings";
import { Shift, SpareRoomProvider } from "./mario/shift";
import { startMicrophone } from "./mic";
import { routeVoice } from "./voice-fx";

const FILTER_LIMIT = 32;
const EMPTY_TILES: LauncherTileView[] = [];
const EMPTY_PLATES: LauncherState["plates"] = [];
const NO_DIALS: LauncherState["dials"] = { G: null, E: null };
const LOG_LIMIT = 30;
const INFO_MS = 3000;

/** Short confirmation for a control that worked, or "" when the HUD already shows the change. */
function confirmationFor(
  action: SystemAction,
  state: SystemState | undefined,
): string {
  if (action === "volume-step" && state?.volume != null)
    return `VOLUME ${state.volume}%`;
  if (action === "mute-toggle" && state?.muted != null)
    return state.muted ? "MUTED" : "SOUND ON";
  if (action === "mic-toggle" && state?.micMuted != null)
    return state.micMuted ? "MIC MUTED" : "MIC ON";
  if (action === "empty-recyclebin") return "RECYCLE BIN EMPTIED";
  return "";
}

const PREVIEW_APPS: DiscoveredApp[] = [
  ["chatgpt", "ChatGPT"],
  ["claude", "Claude"],
  ["cursor", "Cursor"],
  ["grok", "Grok"],
  ["copilot", "Copilot"],
  ["perplexity", "Perplexity"],
  ["ollama", "Ollama"],
  ["lm-studio", "LM Studio"],
  ["vscode", "Visual Studio Code"],
  ["word", "Word"],
  ["spotify", "Spotify"],
  ["outlook", "Outlook"],
].map(([id, label]) => ({
  id: id as DiscoveredApp["id"],
  label,
  source: "store" as const,
  launchPath: id,
  launchKind: "store" as const,
}));

function hudSlots(
  config: Parameters<typeof resolveHudSlots>[0] & {
    leftList: LauncherState["leftList"];
  },
  ids: string[],
) {
  const { dock, plates, dials } = resolveHudSlots(config, ids);
  return { dock, plates, dials, leftList: config.leftList };
}

function previewState(): LauncherState {
  const home = "/home/mario";
  const config = cloneDefaultConfig();
  // ?plates=1 puts two sample tiles on labelled plates, to check how they look.
  if (new URLSearchParams(window.location.search).get("plates") === "1") {
    config.plates = { "TEN OPF": "chatgpt", CCRP: "cursor" };
    config.dock = ["downloads", "spotify", null, "documents"];
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
    ...hudSlots(
      config,
      tiles.map((tile) => tile.id),
    ),
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
  deep: "",
};

const PHASE_LABEL: Record<VoicePhase, string> = {
  idle: "",
  listening: "LISTENING",
  thinking: "THINKING",
  speaking: "SPEAKING",
};

/** Dev preview only: ?motion=calm or ?motion=off. */
function previewMotion(): MotionMode | undefined {
  if (typeof window === "undefined" || window.jarvis || !import.meta.env.DEV) return undefined;
  const value = new URLSearchParams(window.location.search).get("motion");
  return isMotionMode(value) ? value : undefined;
}

function previewVoice(): VoiceSnapshot {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("voice");
  const phase =
    requested === "listening" ||
    requested === "thinking" ||
    requested === "speaking"
      ? requested
      : "idle";
  const hasKey = params.get("nokey") !== "1";
  return {
    hasKey,
    enabled: hasKey && params.get("off") !== "1",
    capture: false,
    phase,
    heard:
      params.get("heard") ??
      (phase === "speaking" || phase === "thinking" ? "open projects" : ""),
    reply:
      params.get("reply") ?? (phase === "speaking" ? "Opening Projects." : ""),
    error: params.get("voiceError") ?? "",
    launchError: "",
    deep: params.get("deep") ?? "",
  };
}

function useCanvasFit() {
  const read = () =>
    fitCanvas(window.innerWidth || 1192, window.innerHeight || 670);
  const [fit, setFit] = useState(read);
  useEffect(() => {
    const onResize = () => setFit(read());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return fit;
}

const keyOf = (focus: Focus | PlacedSlot) => `${focus.zone}:${focus.slot}`;

function isStepKey(key: string): key is StepKey {
  return (
    key === "ArrowLeft" ||
    key === "ArrowRight" ||
    key === "ArrowUp" ||
    key === "ArrowDown"
  );
}

function Monogram({ text }: { text: string }) {
  return (
    <span className="monogram">
      {text.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

export function App() {
  const fit = useCanvasFit();
  const live = useStats();
  const battery = useBattery();
  const [state, setState] = useState<LauncherState | null>(null);
  const [status, setStatus] = useState("");
  const [pressed, setPressed] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [system, setSystem] = useSystem();
  const recent = useRecent(true);
  const [pendingPower, setPendingPower] = useState<PendingPower | null>(null);
  const [notice, setNotice] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [stale, setStale] = useState(false);
  // Short confirmations (cyan, a few seconds) and the message log behind the status bar.
  const [info, setInfo] = useState("");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const logOpenRef = useRef(false);
  logOpenRef.current = logOpen;
  const infoTimer = useRef<number | undefined>(undefined);
  const record = (text: string, warn = false) =>
    setLog((entries) =>
      [{ at: Date.now(), text, warn }, ...entries].slice(0, LOG_LIMIT),
    );
  const flash = (text: string) => {
    record(text);
    setInfo(text);
    window.clearTimeout(infoTimer.current);
    infoTimer.current = window.setTimeout(() => setInfo(""), INFO_MS);
  };
  const settingsOpenRef = useRef(false);
  settingsOpenRef.current = settingsOpen;
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  // The boot-up sequence plays once each time the HUD loads.
  const [booting, setBooting] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setBooting(false), 2300);
    return () => window.clearTimeout(timer);
  }, []);
  const [voice, setVoice] = useState<VoiceSnapshot>(() =>
    typeof window !== "undefined" && !window.jarvis && import.meta.env.DEV
      ? previewVoice()
      : EMPTY_VOICE,
  );
  const refreshingRef = useRef(false);
  const queryRef = useRef("");
  const pageRef = useRef(0);
  const focusRef = useRef<Focus | null>(null);
  const slotRefs = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocus = useRef(false);
  const actionsRef = useRef({
    step: (_key: StepKey) => {},
    page: (_delta: number) => {},
    activate: () => {},
    focusSearch: () => {},
    filter: (_next: string) => {},
  });

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
    // An old main process behind a new page: say so instead of failing quietly.
    if (missingBridgeMethods(bridge).length > 0) setStale(true);
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
      setPendingPower(null);
      setNotice("");
      setSearch("");
      setSettingsOpen(false);
      queryRef.current = "";
      pageRef.current = 0;
      focusRef.current = null;
      setQuery("");
      setPage(0);
      setFocus(null);
      setStatus((current) => clearLaunchStatus(current));
    });
    const stopVoice = bridge.onVoice((next) => {
      if (!cancel) setVoice(next);
    });
    void bridge
      .getState()
      .then((next) => {
        if (!pushed) apply(next);
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
    return bridge.onSpeak((audio, contentType, effect) => {
      stopAudio();
      const url = URL.createObjectURL(
        new Blob([audio], { type: contentType || "audio/mpeg" }),
      );
      audioUrlRef.current = url;
      const element = new Audio(url);
      audioRef.current = element;
      routeVoice(element, effect);
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
    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      // The search box handles its own keys.
      if (event.target instanceof HTMLInputElement) return;
      // The Settings panel handles its own keys, Esc included.
      if (settingsOpenRef.current) return;
      if (logOpenRef.current && event.key === "Escape") {
        setLogOpen(false);
        return;
      }
      const dismiss = () => {
        setStatus((current) => clearLaunchStatus(current));
        setNotice("");
        setPendingPower(null);
      };
      if (
        event.key === "/" &&
        !queryRef.current &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault();
        dismiss();
        actionsRef.current.focusSearch();
        return;
      }
      if (event.key === "Escape") {
        dismiss();
        if (queryRef.current) {
          actionsRef.current.filter("");
          return;
        }
        window.jarvis?.hide();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "PageUp" || event.key === "PageDown") {
        event.preventDefault();
        dismiss();
        actionsRef.current.page(event.key === "PageDown" ? 1 : -1);
        return;
      }
      if (event.key === "Backspace") {
        event.preventDefault();
        dismiss();
        actionsRef.current.filter(queryRef.current.slice(0, -1));
        return;
      }
      if (isStepKey(event.key)) {
        event.preventDefault();
        dismiss();
        actionsRef.current.step(event.key);
        return;
      }
      if (event.key === "Enter") {
        const target = event.target;
        if (target instanceof HTMLElement && target.closest("button")) return;
        event.preventDefault();
        actionsRef.current.activate();
        return;
      }
      if (event.key.length !== 1) return;
      if (
        event.key === " " &&
        event.target instanceof HTMLElement &&
        event.target.closest("button")
      )
        return;
      event.preventDefault();
      dismiss();
      actionsRef.current.filter(
        (queryRef.current + event.key).slice(0, FILTER_LIMIT),
      );
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const tiles = state?.tiles ?? EMPTY_TILES;
  const platesConfig = state?.plates ?? EMPTY_PLATES;
  const dials = state?.dials ?? NO_DIALS;
  const reserved = useMemo(
    () => [dials.G, dials.E].filter((id): id is string => id !== null),
    [dials.G, dials.E],
  );
  const layout = useMemo(
    () => layoutMario(tiles, page, platesConfig, reserved),
    [tiles, page, platesConfig, reserved],
  );
  const dockLabels = (state?.dock ?? []).map((id) =>
    id ? (tiles.find((tile) => tile.id === id)?.label ?? null) : null,
  );
  const safePage = Math.min(page, layout.pageCount - 1);
  const selectable = (slot: PlacedSlot) => slotMatches(slot, tiles, query);
  const all = [...layout.tabs, ...layout.left, ...layout.ring];
  const filtering = query.trim().length > 0;
  const focusValid =
    focus &&
    all.some((slot) => keyOf(slot) === keyOf(focus) && selectable(slot));
  const current = focusValid ? focus : firstFocus(layout, selectable);
  focusRef.current = current;
  pageRef.current = safePage;

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  useEffect(() => {
    if (!pendingFocus.current) return;
    pendingFocus.current = false;
    if (current) slotRefs.current.get(keyOf(current))?.focus();
  });

  // Every failure that reaches the status bar also goes in the log.
  useEffect(() => {
    if (notice) record(notice, true);
  }, [notice]);
  useEffect(() => {
    if (isLaunchStatus(status) || isVoiceStatus(status)) record(status, true);
  }, [status]);

  const labelOf = (id: string) =>
    tiles.find((tile) => tile.id === id)?.label ?? id;

  const launchSlot = async (slot: PlacedSlot) => {
    const tile = slot.tile >= 0 ? tiles[slot.tile] : undefined;
    setStatus((value) => clearLaunchStatus(value));
    if (!tile) {
      setStatus(launchStatusText(`${slot.name || slot.text} not found`));
      return;
    }
    setPressed(keyOf(slot));
    window.setTimeout(
      () => setPressed((value) => (value === keyOf(slot) ? null : value)),
      220,
    );
    const bridge = window.jarvis;
    if (!bridge) return;
    const result = await bridge.launch(tile.id);
    if (!result.ok) setStatus(launchStatusText(result.error));
    else record(`OPENED ${tile.label.toUpperCase()}`);
  };

  actionsRef.current = {
    step: (key) => {
      const from = focusRef.current ?? firstFocus(layout, selectable);
      if (!from) return;
      const next = stepMario(layout, from, key, selectable);
      setFocus(next);
      pendingFocus.current = true;
    },
    page: (delta) => {
      const next = Math.max(
        0,
        Math.min(layout.pageCount - 1, pageRef.current + delta),
      );
      if (next === pageRef.current) return;
      setPage(next);
      const nextLayout = layoutMario(tiles, next, platesConfig, reserved);
      const first = nextLayout.ring
        .filter(selectable)
        .sort((a, b) => a.slot - b.slot)[0];
      if (first) setFocus({ zone: "ring", slot: first.slot });
      pendingFocus.current = true;
    },
    activate: () => {
      const target = focusRef.current;
      const slot = target
        ? all.find((entry) => keyOf(entry) === keyOf(target))
        : undefined;
      if (slot && selectable(slot)) {
        void launchSlot(slot);
        return;
      }
      // A filter that matches nothing becomes a web search.
      if (queryRef.current.trim()) void webSearch(queryRef.current);
    },
    focusSearch: () => searchRef.current?.focus(),
    filter: (next) => {
      queryRef.current = next;
      setQuery(next);
      const hit = tiles.findIndex((tile) =>
        tile.label.toLowerCase().includes(next.trim().toLowerCase()),
      );
      const ringPage = hit >= 0 ? layout.ringPage.get(hit) : undefined;
      if (next.trim() && ringPage !== undefined) setPage(ringPage);
      setFocus(null);
      pendingFocus.current = true;
    },
  };

  useEffect(() => {
    if (!pendingPower) return;
    const timer = window.setTimeout(
      () => setPendingPower(null),
      Math.max(0, pendingPower.until - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [pendingPower]);

  const runSystem = (action: SystemAction, value?: number) => {
    const bridge = window.jarvis;
    if (!bridge) return;
    setNotice("");
    void bridge
      .systemAction(action, value)
      .then((result) => {
        if (result.state) setSystem(result.state);
        if (!result.ok) {
          setNotice(`SYSTEM FAILED  ${result.error ?? ""}`.trim());
          return;
        }
        if (result.detail) record(result.detail.toUpperCase());
        const done = confirmationFor(action, result.state);
        if (done) flash(done);
      })
      .catch(() => setNotice("SYSTEM FAILED"));
  };

  const dismissStatus = () => {
    setStatus((value) => clearLaunchStatus(value));
    setNotice("");
    setPendingPower(null);
  };

  const onEmptyBin = () => {
    const step = powerClick(pendingPower, "empty-recyclebin", Date.now());
    setPendingPower(step.pending);
    if (step.run) runSystem("empty-recyclebin");
  };

  const onPower = (action: PowerAction) => {
    const step = powerClick(pendingPower, action, Date.now());
    setPendingPower(step.pending);
    if (step.run) runSystem(action);
  };

  const launchDial = async (name: "G" | "E") => {
    const id = dials[name];
    if (!id) {
      setNotice(`DIAL ${name} IS EMPTY  SET IT IN SETTINGS`);
      return;
    }
    const bridge = window.jarvis;
    if (!bridge) return;
    setNotice("");
    setStatus((value) => clearLaunchStatus(value));
    const result = await bridge.launch(id);
    if (!result.ok) setStatus(launchStatusText(result.error));
    else record(`OPENED ${labelOf(id).toUpperCase()}`);
  };

  const talk = async () => {
    const bridge = window.jarvis;
    if (!bridge) return;
    const result = await bridge.talk();
    if (!result.ok)
      setNotice((result.error ?? "Voice is unavailable").toUpperCase());
    else setNotice("");
  };

  const openRecent = async (id: string) => {
    const bridge = window.jarvis;
    if (!bridge) return;
    const name = recent.find((item) => item.id === id)?.name ?? "file";
    const result = await bridge.openRecent(id);
    if (!result.ok) setNotice(`OPEN FAILED  ${result.error ?? ""}`.trim());
    else record(`OPENED ${name.toUpperCase()}`);
  };

  const dialLabel = (name: "G" | "E") => {
    const id = dials[name];
    const label = id ? tiles.find((tile) => tile.id === id)?.label : undefined;
    return label ? `${name} dial: ${label}` : `${name} dial: empty`;
  };

  const launchDock = async (index: number) => {
    const id = state?.dock?.[index];
    if (!id) {
      setNotice(`DOCK SLOT ${index + 1} IS EMPTY  SET IT IN SETTINGS`);
      return;
    }
    const bridge = window.jarvis;
    if (!bridge) return;
    setNotice("");
    setStatus((value) => clearLaunchStatus(value));
    const result = await bridge.launch(id);
    if (!result.ok) setStatus(launchStatusText(result.error));
    else record(`OPENED ${labelOf(id).toUpperCase()}`);
  };

  const webSearch = async (value: string) => {
    const text = value.trim();
    if (!text) return;
    const bridge = window.jarvis;
    if (!bridge) return;
    const result = await bridge.webSearch(text);
    if (!result.ok) setNotice(`SEARCH FAILED  ${result.error ?? ""}`.trim());
    else {
      setSearch("");
      actionsRef.current.filter("");
    }
  };

  const toggleVoice = () => {
    if (!voice.hasKey) return;
    const next = !voice.enabled;
    setVoice((value) => ({
      ...value,
      enabled: next,
      capture: next && value.hasKey,
    }));
    void window.jarvis?.setVoiceEnabled(next);
  };

  const refresh = () => {
    if (!acceptRefreshClick(refreshingRef.current)) return;
    const bridge = window.jarvis;
    if (!bridge) return;
    refreshingRef.current = true;
    setRefreshing(true);
    setStatus((value) => clearLaunchStatus(value));
    void bridge
      .refresh()
      .catch(() => setStatus((value) => value || "REFRESH FAILED"))
      .finally(() => {
        refreshingRef.current = false;
        setRefreshing(false);
      });
  };

  const matchCount = all.filter(
    (slot) => slot.tile >= 0 && selectable(slot),
  ).length;
  const hint = footerHint({
    status,
    refreshing,
    scanning: state?.scanning ?? Boolean(window.jarvis),
    refreshFailed: state?.refreshFailed ?? false,
    query,
    matchCount: filtering ? matchCount : undefined,
    warning: "",
  });
  // A pending power confirmation, then a system or search failure, then the usual hint.
  const line = stale
    ? "RESTART JARVIS  CODE IS OUT OF DATE"
    : pendingPower
      ? confirmText(pendingPower.action)
      : notice || info || hint;
  const showHint = line !== "SELECT A SYSTEM";
  const warn =
    stale ||
    Boolean(pendingPower) ||
    Boolean(notice) ||
    isLaunchStatus(hint) ||
    isVoiceStatus(hint);

  const configWarnings = state?.warnings.length ?? 0;
  const idleText =
    configWarnings > 0
      ? `${configWarnings} CONFIG WARNING${configWarnings === 1 ? "" : "S"}`
      : "ID-6TH / AM";

  const slotClass = (slot: PlacedSlot, base: string) => {
    const lit = selectable(slot);
    return [
      base,
      current && keyOf(current) === keyOf(slot) ? "active" : "",
      filtering && !lit ? "dim" : "",
      filtering && lit ? "lit" : "",
      pressed === keyOf(slot) ? "pressed" : "",
    ]
      .filter(Boolean)
      .join(" ");
  };

  const slotButton = (
    slot: PlacedSlot,
    className: string,
    style: CSSProperties,
    body: JSX.Element,
  ) => {
    const tile = slot.tile >= 0 ? tiles[slot.tile] : undefined;
    const label = tile?.label ?? slot.name;
    const active = current != null && keyOf(current) === keyOf(slot);
    return (
      <button
        key={keyOf(slot)}
        type="button"
        ref={(node) => {
          if (node) slotRefs.current.set(keyOf(slot), node);
          else slotRefs.current.delete(keyOf(slot));
        }}
        className={slotClass(slot, className)}
        style={style}
        aria-label={label}
        title={label}
        tabIndex={active ? 0 : -1}
        aria-disabled={(filtering && !selectable(slot)) || undefined}
        data-missing={slot.tile < 0 || undefined}
        onFocus={() => setFocus({ zone: slot.zone, slot: slot.slot })}
        onClick={() => {
          if (!selectable(slot)) return;
          void launchSlot(slot);
        }}
      >
        {body}
      </button>
    );
  };

  const icon = (slot: PlacedSlot) => {
    const tile = slot.tile >= 0 ? tiles[slot.tile] : undefined;
    if ((state?.iconStyle ?? "hud") === "hud") {
      // The HUD icon set: one glyph per kind of app, so new apps match.
      return (
        <HudIcon
          className="slot-icon"
          kind={iconForTile(state?.icons, tile?.id, tile?.label, slot.name)}
        />
      );
    }
    return tile?.icon ? (
      <img className="slot-icon" src={tile.icon} alt="" draggable={false} />
    ) : (
      <Monogram text={slot.name} />
    );
  };

  const plates: PlateState[] = layout.ring.map((slot) => ({
    slot: slot.slot,
    active: current != null && keyOf(current) === keyOf(slot),
    dim: filtering && !selectable(slot),
    lit: filtering && selectable(slot),
    pressed: pressed === keyOf(slot),
  }));

  const motionMode: MotionMode = previewMotion() ?? state?.motion ?? "full";

  const showSubtitle =
    voice.phase !== "idle" || voice.heard.length > 0 || voice.reply.length > 0;

  return (
    <NowProvider>
      <div className={`mario-screen motion-${motionMode}`}>
        <SpareRoomProvider value={{ extraX: fit.extraX, extraY: fit.extraY }}>
          <div
            className={`mario-canvas${booting && motionMode !== "off" ? " booting" : ""}`}
            style={{
              width: 1192 + fit.extraX,
              height: 670 + fit.extraY,
              transform: `scale(${fit.scale})`,
            }}
          >
            <Chassis />
            <Reactor
              phase={voice.phase}
              cpu={live.stats?.cpuPct ?? null}
              plates={plates}
            />
            <Motion mode={motionMode} phase={voice.phase} booting={booting} />
            <Gauges stats={live.stats} />
            <AnalogClock />
            <LevelMeter stats={live.stats} battery={battery} />
            <Telemetry
              stats={live.stats}
              down={live.down}
              up={live.up}
              battery={battery}
            />
            <Identity />
            <Shift fx={0} fy={0}>
              <button
                type="button"
                className={`emblem-btn phase-${voice.phase}`}
                aria-label={
                  voice.phase === "listening"
                    ? "Stop listening"
                    : "Talk to Jarvis"
                }
                title={
                  voice.phase === "listening"
                    ? "Stop listening"
                    : "Talk to Jarvis"
                }
                onClick={() => void talk()}
              />
            </Shift>
            <Shift fx={0} fy={0.2}>
              <button
                type="button"
                className="clock-btn desk"
                aria-label="Open the calendar"
                title="Open the calendar"
                onClick={() => runSystem("open-calendar")}
              />
            </Shift>
            <Shift fx={1} fy={0}>
              <button
                type="button"
                className="clock-btn day"
                aria-label="Open the calendar"
                title="Open the calendar"
                onClick={() => runSystem("open-calendar")}
              />
            </Shift>
            <Shift fx={1} fy={0.3}>
              <button
                type="button"
                className="clock-btn analog"
                aria-label="Open the calendar"
                title="Open the calendar"
                onClick={() => runSystem("open-calendar")}
              />
            </Shift>
            <Shift fx={0.5} fy={0.5}>
              <button
                type="button"
                className="dial-btn g"
                aria-label={dialLabel("G")}
                title={dialLabel("G")}
                onClick={() => void launchDial("G")}
              />
              <button
                type="button"
                className="dial-btn e"
                aria-label={dialLabel("E")}
                title={dialLabel("E")}
                onClick={() => void launchDial("E")}
              />
            </Shift>
            <Shift fx={0} fy={0}>
              <button
                type="button"
                className="badge-btn"
                aria-label="Settings"
                title="Settings"
                onClick={() => setSettingsOpen(true)}
              />
            </Shift>
            <Shift fx={1} fy={0.75}>
              <button
                type="button"
                className="ok-btn"
                aria-label="Dismiss message"
                title="Dismiss message"
                onClick={dismissStatus}
              />
              <button
                type="button"
                className="close-btn"
                aria-label="Hide Jarvis"
                title="Hide Jarvis"
                onClick={() => window.jarvis?.hide()}
              />
            </Shift>
            <DesktopClock />
            <DayBlock />
            <SystemButtons
              pending={
                pendingPower && pendingPower.action !== "empty-recyclebin"
                  ? pendingPower.action
                  : null
              }
              onPower={onPower}
              brightness={system.brightness}
              onBrightness={(value) => {
                setSystem({ ...system, brightness: value });
                runSystem("brightness-set", value);
              }}
            />
            <VolumeKnobs onStep={(delta) => runSystem("volume-step", delta)} />
            <WeatherPanel report={live.stats?.weather ?? null} />
            <RamBin
              stats={live.stats}
              binArmed={pendingPower?.action === "empty-recyclebin"}
              onRam={() => runSystem("open-taskmgr")}
              onBin={() => runSystem("open-recyclebin")}
              onEmptyBin={onEmptyBin}
            />
            <LeftList
              mode={state?.leftList ?? "recent"}
              items={recent}
              onOpen={(id) => void openRecent(id)}
            />
            <MediaBar
              system={system}
              onAction={(action, value) => {
                if (action === "volume-set" && value != null)
                  setSystem({
                    ...system,
                    volume: value,
                    muted: value > 0 ? false : system.muted,
                  });
                runSystem(action, value);
              }}
            />
            <Dock
              query={search}
              inputRef={searchRef}
              onQuery={setSearch}
              onSubmit={(value) => {
                void webSearch(value);
                searchRef.current?.blur();
              }}
              onCancel={() => {
                setSearch("");
                searchRef.current?.blur();
              }}
              dock={dockLabels}
              onDock={(index) => void launchDock(index)}
              onSettings={() => setSettingsOpen(true)}
            />

            <Shift fx={0.5} fy={0}>
              <nav className="tabs" aria-label="Top programs">
                {layout.tabs.map((slot) =>
                  slotButton(
                    slot,
                    "tab",
                    { left: 368 + slot.slot * 80 },
                    <>
                      {icon(slot)}
                      <FitText text={slot.text} slanted />
                      <span className="tab-bar" />
                    </>,
                  ),
                )}
              </nav>
            </Shift>

            <Shift fx={0} fy={0.33}>
              <nav className="launchers" aria-label="Programs">
                {layout.left.map((slot) =>
                  slotButton(
                    slot,
                    "launcher",
                    { top: [112, 155, 199, 243, 287, 330][slot.slot] },
                    <>
                      <span className="flare" />
                      <span className="launcher-plate" />
                      <span className="launcher-tick" />
                      {icon(slot)}
                      <FitText text={slot.text} />
                      <span className="launcher-bar" />
                    </>,
                  ),
                )}
              </nav>
            </Shift>

            <Shift fx={0.5} fy={0.5}>
              <nav className="ring" aria-label="More programs">
                {layout.ring.map((slot) => {
                  const tile = tiles[slot.tile];
                  const angle = plateAngle(slot.slot);
                  const r = (REACTOR.plateInner + REACTOR.plateOuter) / 2;
                  return slotButton(
                    slot,
                    "plate-btn",
                    {
                      left: REACTOR.cx + r * Math.sin(angle) - 21,
                      top: REACTOR.cy - r * Math.cos(angle) - 12,
                    },
                    // A labelled plate keeps the design text, which the reactor art already draws.
                    <span className="plate-label">
                      {slot.text ? "" : (tile?.label ?? "")}
                    </span>,
                  );
                })}
              </nav>
            </Shift>

            <Shift fx={0} fy={0.5}>
              <button
                type="button"
                className="page-btn up"
                aria-label="Previous page"
                disabled={safePage === 0}
                onClick={() => actionsRef.current.page(-1)}
              />
              <button
                type="button"
                className="page-btn down"
                aria-label="Next page"
                disabled={safePage >= layout.pageCount - 1}
                onClick={() => actionsRef.current.page(1)}
              />
            </Shift>

            <Shift fx={0} fy={1}>
              <div className="commands">
                <button
                  type="button"
                  className="cmd"
                  aria-label="Refresh"
                  title="Refresh"
                  aria-busy={refreshing}
                  onClick={refresh}
                >
                  <svg viewBox="0 0 16 16">
                    <path d="M12.5 5 A5.2 5.2 0 1 0 13.2 9.5 M12.8 2.2 V5.4 H9.6" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="cmd"
                  aria-label="Hide"
                  title="Hide"
                  onClick={() => window.jarvis?.hide()}
                >
                  <svg viewBox="0 0 16 16">
                    <circle cx="8" cy="8" r="5.3" />
                    <path d="M5.3 8 H10.7" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="cmd"
                  aria-label="Quit"
                  title="Quit"
                  onClick={() => window.jarvis?.quit()}
                >
                  <svg viewBox="0 0 16 16">
                    <path d="M5.2 4.6 A5 5 0 1 0 10.8 4.6 M8 2.5 V7.6" />
                  </svg>
                </button>
                <button
                  type="button"
                  className={voice.hasKey && voice.enabled ? "cmd on" : "cmd"}
                  aria-label={
                    voice.hasKey
                      ? voice.enabled
                        ? "Voice on"
                        : "Voice off"
                      : "Voice: no key"
                  }
                  title={
                    voice.hasKey
                      ? voice.enabled
                        ? "Voice on"
                        : "Voice off"
                      : "Voice: no key"
                  }
                  aria-pressed={voice.hasKey ? voice.enabled : undefined}
                  onClick={toggleVoice}
                >
                  <svg viewBox="0 0 16 16">
                    <circle cx="8" cy="8" r="5.3" />
                    <rect x="6.6" y="4.6" width="2.8" height="4.8" rx="1.4" />
                    <path d="M5.6 8.4 A2.4 2.4 0 0 0 10.4 8.4 M8 10.8 V11.8" />
                  </svg>
                </button>
              </div>
            </Shift>

            <Shift fx={0} fy={1}>
              <p
                className={[
                  "status",
                  showHint ? "live" : "",
                  warn || (!showHint && configWarnings > 0) ? "warn" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-live="polite"
              >
                {showHint ? line : idleText}
              </p>
              <button
                type="button"
                className="status-btn"
                aria-label="Messages"
                aria-expanded={logOpen}
                title="Messages"
                onClick={() => setLogOpen((open) => !open)}
              />
              {logOpen ? (
                <MessageLog
                  entries={log}
                  warnings={state?.warnings ?? []}
                  onClose={() => setLogOpen(false)}
                  onClear={() => setLog([])}
                />
              ) : null}
            </Shift>

            <Shift fx={0.5} fy={0.5}>
              {showSubtitle ? (
                <p className="subtitle" aria-live="polite">
                  {PHASE_LABEL[voice.phase] ? (
                    <span className="phase">{PHASE_LABEL[voice.phase]}</span>
                  ) : null}
                  {voice.heard ? (
                    <span className="heard">{voice.heard}</span>
                  ) : null}
                  {voice.reply ? (
                    <span className="reply">{voice.reply}</span>
                  ) : null}
                </p>
              ) : null}
              {voice.deep ? (
                <p className="deep-status" role="status" title={voice.deep}>
                  <i aria-hidden="true" />
                  {voice.deep}
                </p>
              ) : null}
            </Shift>

            {settingsOpen ? (
              <Shift fx={0.5} fy={0.5}>
                <SettingsPanel
                  tiles={tiles}
                  onClose={() => setSettingsOpen(false)}
                  onSaved={() => {
                    setSettingsOpen(false);
                    flash("SETTINGS SAVED");
                  }}
                />
              </Shift>
            ) : null}
          </div>
        </SpareRoomProvider>
      </div>
    </NowProvider>
  );
}
