import type { DesktopScheme } from "@substrate/contracts/desktop/identity";
import { desktopLink, type desktopPath } from "@substrate/contracts/desktop/links";
import { publicFailure, success } from "@substrate/contracts/result";

import type { z } from "zod";

type DesktopPath = z.output<typeof desktopPath>;

export interface DesktopConfig {
  desktopScheme: DesktopScheme;
  webURL: string;
  windowsDownloadURL?: string;
}

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
  return {
    release() {
      return success({ windowsAvailable: Boolean(config.windowsDownloadURL) });
    },
    downloadURL() {
      if (!config.windowsDownloadURL)
        return publicFailure("NOT_FOUND", "The Windows installer is not available yet.");
      return success(config.windowsDownloadURL);
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
