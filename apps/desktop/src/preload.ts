import {
  agentWorkChangeChannel,
  agentWorkChannel,
  type AgentWorkChange,
} from "@substrate/contracts/agent-work/desktop";
import {
  desktopSettingsChannel,
  fullscreenChannel,
  windowChannel,
  type DesktopSettingsAPI,
  type DesktopWindowAPI,
} from "@substrate/contracts/desktop/window";
import type { HarnessAPI } from "@substrate/contracts/harness/desktop";
import {
  realtimeChannel,
  realtimeEventChannel,
  type RealtimeAPI,
  type RealtimeUpdate,
} from "@substrate/contracts/realtime";

import { agentWorkAPI } from "./agents/bridge/agent-work-api.ts";
import { harnessChannel } from "./harness/bridge/harness-bridge.ts";
import { setupRenderer } from "@better-auth/electron/preload";
import { contextBridge, ipcRenderer } from "electron";

const origin = process.argv
  .find((value) => value.startsWith("--substrate-origin="))
  ?.slice("--substrate-origin=".length);
if (process.isMainFrame && window.location.origin === origin) {
  setupRenderer();
  const realtime: RealtimeAPI = {
    connect: (input: { organizationId: string | null }) =>
      ipcRenderer.invoke(realtimeChannel, "connect", input),
    disconnect: () => ipcRenderer.invoke(realtimeChannel, "disconnect"),
    onEvent: (callback: (event: RealtimeUpdate) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, value: RealtimeUpdate) =>
        callback(value);
      ipcRenderer.on(realtimeEventChannel, listener);
      return () => ipcRenderer.removeListener(realtimeEventChannel, listener);
    },
  };
  contextBridge.exposeInMainWorld("substrateRealtime", realtime);
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
  contextBridge.exposeInMainWorld("substrateWindow", windowAPI);
  const settings: DesktopSettingsAPI = {
    get: () => ipcRenderer.invoke(desktopSettingsChannel, "get"),
    setLaunchAtLogin: (enabled) =>
      ipcRenderer.invoke(desktopSettingsChannel, "setLaunchAtLogin", enabled),
  };
  contextBridge.exposeInMainWorld("substrateDesktopSettings", settings);
  const api: HarnessAPI = {
    status: () => ipcRenderer.invoke(harnessChannel, "status"),
    listModels: (input) => ipcRenderer.invoke(harnessChannel, "listModels", input),
    synchronize: () => ipcRenderer.invoke(harnessChannel, "synchronize"),
    disconnect: () => ipcRenderer.invoke(harnessChannel, "disconnect"),
    scanConfiguration: (input) => ipcRenderer.invoke(harnessChannel, "scanConfiguration", input),
    saveSkill: (input) => ipcRenderer.invoke(harnessChannel, "saveSkill", input),
    deleteSkill: (input) => ipcRenderer.invoke(harnessChannel, "deleteSkill", input),
    resetDefaults: (input) => ipcRenderer.invoke(harnessChannel, "resetDefaults", input),
    saveMcpServer: (input) => ipcRenderer.invoke(harnessChannel, "saveMcpServer", input),
    deleteMcpServer: (input) => ipcRenderer.invoke(harnessChannel, "deleteMcpServer", input),
  };
  contextBridge.exposeInMainWorld("substrateHarness", api);
  contextBridge.exposeInMainWorld(
    "substrateAgentWork",
    agentWorkAPI(
      // SAFETY: main returns the AgentWorkAPI result of each method; the API types each call.
      (method, value) => ipcRenderer.invoke(agentWorkChannel, method, value) as Promise<never>,
      (callback) => {
        const listener = (_event: Electron.IpcRendererEvent, value: AgentWorkChange) =>
          callback(value);
        ipcRenderer.on(agentWorkChangeChannel, listener);
        return () => ipcRenderer.removeListener(agentWorkChangeChannel, listener);
      },
    ),
  );
}
