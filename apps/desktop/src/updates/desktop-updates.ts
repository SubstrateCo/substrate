import { handleBridge } from "@substrate/contracts/desktop/ipc";
import * as updatesIPC from "@substrate/contracts/desktop/updates-ipc";

import { trustedSender } from "../shell/trusted-sender.ts";
import { emitToRenderer } from "../transport/realtime-events.ts";
import { releasePageURL, releaseRepositorySchema } from "./release-repository.ts";
import { createDesktopUpdater, updateInstallMode } from "./updater.ts";
import { app, type BrowserWindow, ipcMain, Notification, shell } from "electron";
import electronUpdater from "electron-updater";
import { readFileSync } from "node:fs";

function readReleaseRepository() {
  try {
    return releaseRepositorySchema.parse(
      JSON.parse(readFileSync(new URL("./update-config.json", import.meta.url), "utf8")),
    );
  } catch (error) {
    console.error("Desktop updates are off: the build has no valid update-config.json.", error);
    return undefined;
  }
}

/**
 * Checks the public releases repository and exposes update status to the renderer. Updates run
 * only in packaged builds; electron-updater reads the feed from the app-update.yml that
 * electron-builder writes from the same publish config.
 */
export function setupDesktopUpdates(options: {
  enabled: boolean;
  getWindow: () => BrowserWindow | undefined;
  showWindow: () => void;
  rendererURL: string;
  prepareInstall: () => Promise<void>;
}) {
  const repository = options.enabled && app.isPackaged ? readReleaseRepository() : undefined;
  const install = repository ? updateInstallMode(process.platform, app.isPackaged) : "unavailable";
  const updater = createDesktopUpdater({
    // The getter constructs the platform updater, so only touch it when updates can run.
    engine: install === "unavailable" ? undefined : electronUpdater.autoUpdater,
    install,
    appVersion: app.getVersion(),
    releasePage: (version) => (repository ? releasePageURL(repository, version) : ""),
    onChange: (status) =>
      emitToRenderer(options.getWindow(), updatesIPC.statusChannel, status, options.rendererURL),
    onAttention: (state) => {
      if (!Notification.isSupported() || options.getWindow()?.isFocused()) return;
      const notification = new Notification(
        state.status === "ready"
          ? {
              title: "Update ready",
              body: `Restart Substrate to install version ${state.version}.`,
            }
          : {
              title: `Substrate ${state.version} is available`,
              body: "Open Substrate to download it.",
            },
      );
      notification.on("click", options.showWindow);
      notification.show();
    },
    openExternal: (url) => shell.openExternal(url),
    prepareInstall: options.prepareInstall,
    log: (message, error) => console.error(message, error),
  });
  const dispatch = handleBridge(updatesIPC.channel, updatesIPC.methods, {
    get: () => updater.status(),
    checkForUpdates: () => updater.checkForUpdates(),
    installNow: () => updater.installNow(),
    openDownloadPage: () => updater.openDownloadPage(),
  });
  ipcMain.handle(updatesIPC.channel, (event, method, value) => {
    if (!trustedSender(event, options.getWindow()?.webContents, options.rendererURL))
      throw new Error("Updates unavailable.");
    return dispatch(method, value);
  });
  return updater;
}
