import {
  agentWorkChangeChannel,
  agentWorkChannel,
  type AgentWorkChange,
} from "@substrate/contracts/agent-work/desktop";
import * as agentWorkIPC from "@substrate/contracts/agent-work/ipc";
import * as attentionIPC from "@substrate/contracts/desktop/attention-ipc";
import { exposeBridge } from "@substrate/contracts/desktop/ipc";
import * as settingsIPC from "@substrate/contracts/desktop/settings-ipc";
import * as updatesIPC from "@substrate/contracts/desktop/updates-ipc";
import {
  desktopSettingsChannel,
  fullscreenChannel,
  windowChannel,
  type DesktopSettingsAPI,
  type DesktopWindowAPI,
} from "@substrate/contracts/desktop/window";
import * as windowIPC from "@substrate/contracts/desktop/window-ipc";
import * as harnessIPC from "@substrate/contracts/harness/ipc";
import * as mailIPC from "@substrate/contracts/mail/ipc";
import {
  realtimeChannel,
  realtimeEventChannel,
  type RealtimeAPI,
  type RealtimeUpdate,
} from "@substrate/contracts/realtime";
import * as realtimeIPC from "@substrate/contracts/realtime/ipc";

import { setupRenderer } from "@better-auth/electron/preload";
import { contextBridge, ipcRenderer } from "electron";

const origin = process.argv
  .find((value) => value.startsWith("--substrate-origin="))
  ?.slice("--substrate-origin=".length);
if (process.isMainFrame && window.location.origin === origin) {
  setupRenderer();
  contextBridge.exposeInMainWorld(
    "substrateAttention",
    exposeBridge(attentionIPC.channel, attentionIPC.methods, ipcRenderer.invoke.bind(ipcRenderer)),
  );
  contextBridge.exposeInMainWorld(
    "substrateMail",
    exposeBridge(mailIPC.channel, mailIPC.methods, ipcRenderer.invoke.bind(ipcRenderer)),
  );
  const realtime: RealtimeAPI = {
    ...exposeBridge(realtimeChannel, realtimeIPC.methods, ipcRenderer.invoke.bind(ipcRenderer)),
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
    production: process.argv.includes("--substrate-production"),
    ...exposeBridge(windowChannel, windowIPC.methods, ipcRenderer.invoke.bind(ipcRenderer)),
    onFullscreenChange: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, value: boolean) => callback(value);
      ipcRenderer.on(fullscreenChannel, listener);
      return () => ipcRenderer.removeListener(fullscreenChannel, listener);
    },
  };
  contextBridge.exposeInMainWorld("substrateWindow", windowAPI);
  const settings: DesktopSettingsAPI = exposeBridge(
    desktopSettingsChannel,
    settingsIPC.methods,
    ipcRenderer.invoke.bind(ipcRenderer),
  );
  contextBridge.exposeInMainWorld("substrateDesktopSettings", settings);
  const updates: updatesIPC.DesktopUpdatesAPI = {
    ...exposeBridge(updatesIPC.channel, updatesIPC.methods, ipcRenderer.invoke.bind(ipcRenderer)),
    onChange: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, value: updatesIPC.DesktopUpdateStatus) =>
        callback(value);
      ipcRenderer.on(updatesIPC.statusChannel, listener);
      return () => ipcRenderer.removeListener(updatesIPC.statusChannel, listener);
    },
  };
  contextBridge.exposeInMainWorld("substrateUpdates", updates);
  const api = exposeBridge(
    harnessIPC.channel,
    harnessIPC.methods,
    ipcRenderer.invoke.bind(ipcRenderer),
  );
  contextBridge.exposeInMainWorld("substrateHarness", api);
  contextBridge.exposeInMainWorld("substrateAgentWork", {
    ...exposeBridge(agentWorkChannel, agentWorkIPC.methods, ipcRenderer.invoke.bind(ipcRenderer)),
    onChange: (callback: (change: AgentWorkChange) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, value: AgentWorkChange) =>
        callback(value);
      ipcRenderer.on(agentWorkChangeChannel, listener);
      return () => ipcRenderer.removeListener(agentWorkChangeChannel, listener);
    },
  });
}
