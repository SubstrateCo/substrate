export const windowChannel = "startup-os:window";
export const fullscreenChannel = "startup-os:fullscreen";

export interface DesktopWindowAPI {
  platform: string;
  isFullscreen(): Promise<boolean>;
  setTheme(theme: "light" | "dark"): Promise<void>;
  onFullscreenChange(callback: (fullscreen: boolean) => void): () => void;
}

declare global {
  interface Window {
    startupOSWindow?: DesktopWindowAPI;
  }
}
