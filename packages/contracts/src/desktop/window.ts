import type { WindowMethods } from "./window-ipc.ts";
export { channel as windowChannel } from "./window-ipc.ts";
export const fullscreenChannel = "substrate:fullscreen";
export { channel as desktopSettingsChannel } from "./settings-ipc.ts";
export type { DesktopSettingsAPI } from "./settings-ipc.ts";

/** Settings of this desktop installation, kept by the main process. */
export interface DesktopSettings {
  /** Start hidden in the tray when the person signs in to the computer. */
  launchAtLogin: boolean;
}

export interface DesktopWindowAPI extends WindowMethods {
  platform: string;
  onFullscreenChange(callback: (fullscreen: boolean) => void): () => void;
}
