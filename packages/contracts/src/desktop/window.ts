export const windowChannel = "startup-os:window";
export const fullscreenChannel = "startup-os:fullscreen";
export const desktopSettingsChannel = "startup-os:desktop-settings";

/** Settings of this desktop installation, kept by the main process. */
export interface DesktopSettings {
  /** Start hidden in the tray when the person signs in to the computer. */
  launchAtLogin: boolean;
}

export interface DesktopSettingsAPI {
  get(): Promise<DesktopSettings>;
  setLaunchAtLogin(enabled: boolean): Promise<DesktopSettings>;
}

export interface DesktopWindowAPI {
  platform: string;
  isFullscreen(): Promise<boolean>;
  setTheme(theme: "light" | "dark"): Promise<void>;
  onFullscreenChange(callback: (fullscreen: boolean) => void): () => void;
}

declare global {
  interface Window {
    startupOSWindow?: DesktopWindowAPI;
    startupOSDesktopSettings?: DesktopSettingsAPI;
  }
}
