import { fullscreenChannel, windowChannel } from "@substrate/contracts/desktop/window";

import { trustedSender } from "./trusted-sender.ts";
import {
  ipcMain,
  nativeTheme,
  type BrowserWindow,
  type BrowserWindowConstructorOptions,
} from "electron";

const height = 40;

function overlayOptions() {
  return {
    // Fully transparent black does not render correctly on Linux.
    color: "#01000000",
    height,
    symbolColor: nativeTheme.shouldUseDarkColors ? "#f8fafc" : "#1f2937",
  };
}

export function titleBarOptions(): BrowserWindowConstructorOptions {
  if (process.platform === "darwin") {
    return { titleBarStyle: "hiddenInset", trafficLightPosition: { x: 16, y: height / 2 - 7 } };
  }
  return {
    titleBarStyle: "hidden",
    titleBarOverlay: overlayOptions(),
  };
}

export function attachTitleBar(window: BrowserWindow, rendererURL: string) {
  const sync = () => {
    if (window.isDestroyed()) return;
    if (process.platform === "darwin") {
      if (!window.isFullScreen()) {
        window.setWindowButtonPosition({
          x: 16,
          y: Math.round((height * window.webContents.getZoomFactor()) / 2 - 7),
        });
      }
    } else {
      window.setTitleBarOverlay(overlayOptions());
    }
  };
  ipcMain.handle(windowChannel, (event, method, theme) => {
    if (!trustedSender(event, window.webContents, rendererURL)) {
      throw new Error("Untrusted window request.");
    }
    if (method === "fullscreen") return window.isFullScreen();
    if (method !== "theme" || (theme !== "light" && theme !== "dark" && theme !== "system")) {
      throw new Error("Invalid window request.");
    }
    if (nativeTheme.themeSource !== theme) nativeTheme.themeSource = theme;
    if (process.platform === "darwin") sync();
  });
  const fullscreen = (value: boolean) => {
    if (process.platform === "darwin") sync();
    window.webContents.send(fullscreenChannel, value);
  };
  window.on("enter-full-screen", () => fullscreen(true));
  window.on("leave-full-screen", () => fullscreen(false));
  window.webContents.on("did-finish-load", sync);
  nativeTheme.on("updated", sync);
  window.on("closed", () => {
    nativeTheme.removeListener("updated", sync);
    ipcMain.removeHandler(windowChannel);
  });
}
