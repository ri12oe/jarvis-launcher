import { contextBridge, ipcRenderer } from "electron";
import type { JarvisBridge, LauncherState, LaunchResult } from "../shared/types";

const api: JarvisBridge = {
  getState: () => ipcRenderer.invoke("jarvis:get-state") as Promise<LauncherState>,
  launch: (tileId: string) => ipcRenderer.invoke("jarvis:launch", tileId) as Promise<LaunchResult>,
  hide: () => {
    ipcRenderer.send("jarvis:hide");
  },
  quit: () => {
    ipcRenderer.send("jarvis:quit");
  },
};

contextBridge.exposeInMainWorld("jarvis", api);
