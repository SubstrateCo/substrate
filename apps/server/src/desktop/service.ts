import type { DesktopScheme } from "@substrate/contracts/desktop/identity";
import { desktopLink, type desktopPath } from "@substrate/contracts/desktop/links";
import { publicFailure, success } from "@substrate/contracts/result";

import type { z } from "zod";

type DesktopPath = z.output<typeof desktopPath>;

export type InstallerPlatform = "windows" | "mac";

export interface DesktopConfig {
  desktopScheme: DesktopScheme;
  webURL: string;
  windowsDownloadURL?: string;
  macDownloadURL?: string;
}

const platformNames: Record<InstallerPlatform, string> = { windows: "Windows", mac: "macOS" };

export function openDesktop(path: DesktopPath, options: { scheme: DesktopScheme; webURL: string }) {
  const downloadURL = new URL("/download", options.webURL);
  downloadURL.searchParams.set("redirect", path);
  return {
    link: desktopLink(path, options.scheme),
    browserURL: new URL(path, options.webURL).toString(),
    downloadURL: downloadURL.toString(),
  };
}

export function createDesktopService(config: DesktopConfig) {
  const installers: Record<InstallerPlatform, string | undefined> = {
    windows: config.windowsDownloadURL,
    mac: config.macDownloadURL,
  };
  return {
    release() {
      return success({
        windowsAvailable: Boolean(installers.windows),
        macAvailable: Boolean(installers.mac),
      });
    },
    downloadURL(platform: InstallerPlatform) {
      const url = installers[platform];
      if (!url)
        return publicFailure(
          "NOT_FOUND",
          `The ${platformNames[platform]} installer is not available yet.`,
        );
      return success(url);
    },
    open(path: DesktopPath) {
      return openDesktop(path, {
        scheme: config.desktopScheme,
        webURL: config.webURL,
      });
    },
  };
}

export type DesktopService = ReturnType<typeof createDesktopService>;
