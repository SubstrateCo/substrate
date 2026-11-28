import { handleBridge } from "@substrate/contracts/desktop/ipc";
import { channel, methods } from "@substrate/contracts/desktop/screen-notifications-ipc";

import { createOverlayWindow } from "../shell/overlay-window.ts";
import { trustedSender } from "../shell/trusted-sender.ts";
import { createReminderStore } from "./reminder-store.ts";
import { createScreenNotificationCenter } from "./screen-notification-center.ts";
import { ipcMain, powerMonitor } from "electron";
import { join } from "node:path";

export function setupScreenNotifications(options: {
  rendererURL: string;
  partition: string;
  preload: string;
  production: boolean;
  userData: string;
  onWake(): void;
}) {
  const overlay = createOverlayWindow(options);
  const center = createScreenNotificationCenter({ sink: overlay });
  const store = createReminderStore(join(options.userData, "screen-notifications.json"));
  const dispatch = handleBridge(channel, methods, {
    ready: () => center.list(),
    act: ({ id, action }) => center.act(id, action),
    setInteractive: (value) => overlay.setInteractive(value),
  });
  ipcMain.handle(channel, (event, method, value) => {
    if (!trustedSender(event, overlay.webContents(), options.rendererURL))
      throw new Error("Screen notifications unavailable.");
    return dispatch(method, value);
  });
  powerMonitor.on("resume", () => options.onWake());
  powerMonitor.on("unlock-screen", () => options.onWake());
  return {
    center,
    store,
    activate: () => overlay.ensure(),
    deactivate: () => overlay.destroy(),
  };
}
export type ScreenNotifications = ReturnType<typeof setupScreenNotifications>;
