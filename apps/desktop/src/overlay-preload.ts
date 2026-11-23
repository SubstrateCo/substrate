import { exposeBridge, type IpcValue } from "@substrate/contracts/desktop/ipc";
import {
  channel,
  eventChannel,
  methods,
  screenNotificationEvent,
  type ScreenNotificationEvent,
  type ScreenNotificationsBridge,
} from "@substrate/contracts/desktop/screen-notifications-ipc";

import { contextBridge, ipcRenderer } from "electron";

// The overlay window's only bridge. It reaches no other main-process API.
const origin = process.argv
  .find((value) => value.startsWith("--substrate-origin="))
  ?.slice("--substrate-origin=".length);
if (process.isMainFrame && window.location.origin === origin) {
  const bridge: ScreenNotificationsBridge = {
    ...exposeBridge(channel, methods, ipcRenderer.invoke.bind(ipcRenderer)),
    onEvent: (callback: (event: ScreenNotificationEvent) => void) => {
      // Parse main's events too: the overlay renders only cards that match the contract.
      const listener = (_event: Electron.IpcRendererEvent, value: IpcValue) => {
        const parsed = screenNotificationEvent.safeParse(value);
        if (parsed.success) callback(parsed.data);
      };
      ipcRenderer.on(eventChannel, listener);
      return () => ipcRenderer.removeListener(eventChannel, listener);
    },
  };
  contextBridge.exposeInMainWorld("substrateScreenNotifications", bridge);
}
