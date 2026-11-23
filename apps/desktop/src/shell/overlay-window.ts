import {
  eventChannel,
  type ScreenNotificationEvent,
} from "@substrate/contracts/desktop/screen-notifications-ipc";

import { emitToRenderer } from "../transport/realtime-events.ts";
import { overlayBounds } from "./overlay-bounds.ts";
import {
  BrowserWindow,
  powerMonitor,
  screen,
  type BrowserWindowConstructorOptions,
} from "electron";

/** Lets the overlay's exit animation finish before the window hides. */
export const overlayHideDelayMs = 250;
const displayChangeDebounceMs = 500;

/**
 * The transparent, click-through window that shows screen notification cards. It never takes
 * focus: it shows inactive, and it is excluded from screen capture.
 */
export function createOverlayWindow(options: {
  rendererURL: string;
  partition: string;
  preload: string;
  production: boolean;
}) {
  let window: BrowserWindow | undefined;
  let wanted = false;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let recreateTimer: ReturnType<typeof setTimeout> | undefined;
  const live = () => (window && !window.isDestroyed() ? window : undefined);

  function ignoreMouse(target = live()) {
    target?.setIgnoreMouseEvents(true, { forward: true });
  }

  function place(target: BrowserWindow) {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    target.setBounds(overlayBounds(display.workArea));
  }

  function create() {
    const darwin = process.platform === "darwin";
    const settings: BrowserWindowConstructorOptions = {
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      hasShadow: false,
      thickFrame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      focusable: false,
      skipTaskbar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        partition: options.partition,
        preload: options.preload,
        backgroundThrottling: false,
        additionalArguments: [
          `--substrate-origin=${options.rendererURL}`,
          ...(options.production ? ["--substrate-production"] : []),
        ],
      },
    };
    if (darwin) {
      settings.type = "panel";
      settings.hiddenInMissionControl = true;
    }
    const created = new BrowserWindow(settings);
    created.setAlwaysOnTop(true, "screen-saver");
    created.setContentProtection(true);
    if (darwin)
      created.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true,
        skipTransformProcessType: true,
      });
    ignoreMouse(created);
    const contents = created.webContents;
    // The overlay shows cards only. It never navigates or opens windows.
    contents.setWindowOpenHandler(() => ({ action: "deny" }));
    contents.on("will-navigate", (event) => event.preventDefault());
    contents.on("will-redirect", (event) => event.preventDefault());
    contents.on("will-attach-webview", (event) => event.preventDefault());
    window = created;
    void created.loadURL(`${options.rendererURL}/overlay.html`).catch(console.error);
    return created;
  }

  function show() {
    clearTimeout(hideTimer);
    hideTimer = undefined;
    wanted = true;
    const target = live() ?? create();
    if (target.isVisible()) return;
    // The column follows the pointer's display when the first card appears.
    place(target);
    target.showInactive();
  }

  function hide() {
    wanted = false;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      hideTimer = undefined;
      const target = live();
      if (!target || wanted) return;
      ignoreMouse(target);
      target.hide();
    }, overlayHideDelayMs);
  }

  // Transparent windows can turn black after display or lock changes. Replace the window; the new
  // overlay calls ready() and replays the cards.
  function recreate() {
    if (!window) return;
    clearTimeout(recreateTimer);
    recreateTimer = setTimeout(() => {
      recreateTimer = undefined;
      if (!window) return;
      live()?.destroy();
      const created = create();
      if (wanted) {
        place(created);
        created.showInactive();
      }
    }, displayChangeDebounceMs);
  }

  screen.on("display-metrics-changed", recreate);
  screen.on("display-added", recreate);
  screen.on("display-removed", recreate);
  powerMonitor.on("unlock-screen", recreate);

  return {
    /** Creates the hidden window ahead of the first card. */
    ensure() {
      if (!live()) create();
    },
    destroy() {
      clearTimeout(hideTimer);
      clearTimeout(recreateTimer);
      hideTimer = recreateTimer = undefined;
      wanted = false;
      live()?.destroy();
      window = undefined;
    },
    webContents: () => live()?.webContents,
    emit(event: ScreenNotificationEvent) {
      // Main resets click-through on every removal; the overlay re-asserts it on pointer movement.
      if (event.type === "remove") ignoreMouse();
      emitToRenderer(live(), eventChannel, event, options.rendererURL);
    },
    show,
    hide,
    setInteractive(value: boolean) {
      const target = live();
      if (!target) return;
      if (value) target.setIgnoreMouseEvents(false);
      else ignoreMouse(target);
    },
  };
}
export type OverlayWindow = ReturnType<typeof createOverlayWindow>;
