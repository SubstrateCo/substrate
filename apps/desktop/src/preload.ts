import {
  fullscreenChannel,
  windowChannel,
  type DesktopWindowAPI,
} from "@startup-os/contracts/desktop/window";
import type { HarnessEvent } from "@startup-os/contracts/harness";

import type { HarnessAPI } from "./harness/harness-api.ts";
import { harnessChannel, harnessEventChannel } from "./harness/harness-bridge.ts";
import { setupRenderer } from "@better-auth/electron/preload";
import { contextBridge, ipcRenderer } from "electron";

const origin = process.argv
  .find((value) => value.startsWith("--startup-os-origin="))
  ?.slice("--startup-os-origin=".length);
if (process.isMainFrame && window.location.origin === origin) {
  setupRenderer();
  const windowAPI: DesktopWindowAPI = {
    platform: process.platform,
    isFullscreen: () => ipcRenderer.invoke(windowChannel, "fullscreen"),
    setTheme: (theme) => ipcRenderer.invoke(windowChannel, "theme", theme),
    onFullscreenChange: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, value: boolean) => callback(value);
      ipcRenderer.on(fullscreenChannel, listener);
      return () => ipcRenderer.removeListener(fullscreenChannel, listener);
    },
  };
  contextBridge.exposeInMainWorld("startupOSWindow", windowAPI);
  const api: HarnessAPI = {
    version: 1,
    inspect: () => ipcRenderer.invoke(harnessChannel, "status"),
    status: () => ipcRenderer.invoke(harnessChannel, "status"),
    synchronize: () => ipcRenderer.invoke(harnessChannel, "synchronize"),
    execute: (command) => ipcRenderer.invoke(harnessChannel, "execute", command),
    disconnect: () => ipcRenderer.invoke(harnessChannel, "disconnect"),
    reset: () => ipcRenderer.invoke(harnessChannel, "disconnect"),
    scanConfiguration: (input) => ipcRenderer.invoke(harnessChannel, "scanConfiguration", input),
    scanSkills: (input) => ipcRenderer.invoke(harnessChannel, "scanSkills", input),
    saveSkill: (input) => ipcRenderer.invoke(harnessChannel, "saveSkill", input),
    deleteSkill: (input) => ipcRenderer.invoke(harnessChannel, "deleteSkill", input),
    saveMcpServer: (input) => ipcRenderer.invoke(harnessChannel, "saveMcpServer", input),
    deleteMcpServer: (input) => ipcRenderer.invoke(harnessChannel, "deleteMcpServer", input),
    onEvent: (callback: (event: HarnessEvent) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, value: HarnessEvent) => callback(value);
      ipcRenderer.on(harnessEventChannel, listener);
      return () => ipcRenderer.removeListener(harnessEventChannel, listener);
    },
  };
  contextBridge.exposeInMainWorld("startupOSHarness", api);
}
