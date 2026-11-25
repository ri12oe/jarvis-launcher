import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { JarvisBridge, LauncherState, LaunchResult } from "../shared/types";

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
};

contextBridge.exposeInMainWorld("jarvis", api);
