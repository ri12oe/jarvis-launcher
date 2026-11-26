import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { RecentItem } from "../shared/recent";
import type { Place, SettingsValues } from "../shared/settings";
import type { SystemState } from "../shared/system";
import type { JarvisBridge, LauncherState, LaunchResult, SystemActionResult, SystemStats, VoiceSnapshot } from "../shared/types";

function toArrayBuffer(value: unknown): ArrayBuffer | undefined {
  if (value instanceof ArrayBuffer) return value.slice(0);
  if (ArrayBuffer.isView(value)) {
    const view = value;
    return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
  }
  return undefined;
}

const api: JarvisBridge = {
  getState: () => ipcRenderer.invoke("jarvis:get-state") as Promise<LauncherState>,
  onState: (listener) => {
    const wrapped = (_event: IpcRendererEvent, state: LauncherState) => listener(state);
    ipcRenderer.on("jarvis:state", wrapped);
    return () => {
      ipcRenderer.removeListener("jarvis:state", wrapped);
    };
  },
  launch: (tileId: string) => ipcRenderer.invoke("jarvis:launch", tileId) as Promise<LaunchResult>,
  refresh: () => ipcRenderer.invoke("jarvis:refresh") as Promise<void>,
  onHidden: (listener) => {
    const wrapped = () => listener();
    ipcRenderer.on("jarvis:hidden", wrapped);
    return () => {
      ipcRenderer.removeListener("jarvis:hidden", wrapped);
    };
  },
  hide: () => {
    ipcRenderer.send("jarvis:hide");
  },
  quit: () => {
    ipcRenderer.send("jarvis:quit");
  },
  getVoice: () => ipcRenderer.invoke("jarvis:voice-get") as Promise<VoiceSnapshot>,
  talk: () => ipcRenderer.invoke("jarvis:voice-talk") as Promise<{ ok: boolean; error?: string }>,
  getRecent: () => ipcRenderer.invoke("jarvis:recent") as Promise<RecentItem[]>,
  openRecent: (id) => ipcRenderer.invoke("jarvis:open-recent", id) as Promise<{ ok: boolean; error?: string }>,
  locate: () => ipcRenderer.invoke("jarvis:locate") as Promise<{ ok: boolean; error?: string; place?: Place }>,
  onVoice: (listener) => {
    const wrapped = (_event: IpcRendererEvent, voice: VoiceSnapshot) => listener(voice);
    ipcRenderer.on("jarvis:voice", wrapped);
    return () => {
      ipcRenderer.removeListener("jarvis:voice", wrapped);
    };
  },
  setVoiceEnabled: (enabled) => ipcRenderer.invoke("jarvis:voice-enabled", enabled) as Promise<void>,
  pushAudio: (pcm) => {
    ipcRenderer.send("jarvis:voice-pcm", pcm);
  },
  onSpeak: (listener) => {
    const wrapped = (
      _event: IpcRendererEvent,
      payload: { audio?: unknown; contentType?: unknown; effect?: unknown },
    ) => {
      const audio = toArrayBuffer(payload?.audio);
      const contentType = typeof payload?.contentType === "string" ? payload.contentType : "audio/mpeg";
      const effect = payload?.effect === "none" ? "none" : "jarvis";
      if (audio) listener(audio, contentType, effect);
    };
    ipcRenderer.on("jarvis:voice-speak", wrapped);
    return () => {
      ipcRenderer.removeListener("jarvis:voice-speak", wrapped);
    };
  },
  playbackEnded: () => {
    ipcRenderer.send("jarvis:voice-played");
  },
  reportVoiceError: (message) => {
    ipcRenderer.send("jarvis:voice-error", message);
  },
  getStats: () => ipcRenderer.invoke("jarvis:stats") as Promise<SystemStats>,
  getSystem: () => ipcRenderer.invoke("jarvis:system-state") as Promise<SystemState | null>,
  systemAction: (action, value) => ipcRenderer.invoke("jarvis:system-action", action, value ?? 0) as Promise<SystemActionResult>,
  webSearch: (query) => ipcRenderer.invoke("jarvis:web-search", query) as Promise<{ ok: boolean; error?: string }>,
  openConfig: () => ipcRenderer.invoke("jarvis:open-config") as Promise<{ ok: boolean; error?: string }>,
  getSettings: () => ipcRenderer.invoke("jarvis:get-settings") as Promise<SettingsValues | null>,
  saveSettings: (values) => ipcRenderer.invoke("jarvis:save-settings", values) as Promise<{ ok: boolean; error?: string }>,
  findPlace: (query) =>
    ipcRenderer.invoke("jarvis:find-place", query) as Promise<{ ok: boolean; error?: string; places?: Place[] }>,
};

contextBridge.exposeInMainWorld("jarvis", api);
