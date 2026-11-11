import { z } from "zod";

export const desktopOrigin = "https://desktop.substrate.local";
export const desktopScheme = "substrate";
// Desktop main adds this to API requests. It names the installation; it is not a credential.
export const desktopInstallationHeader = "x-substrate-installation";

export const desktopPath = z
  .string()
  .min(1)
  .max(16_384)
  .refine((value) => {
    try {
      const decoded = decodeURIComponent(value);
      // oxlint-disable-next-line no-control-regex -- External app links must not contain URL controls or backslashes.
      const invalidCharacters = /[\\\u0000-\u0020\u007f]/.test(decoded);
      if (!value.startsWith("/") || invalidCharacters || decoded.startsWith("//")) return false;
      const url = new URL(value, desktopOrigin);
      if (url.origin !== desktopOrigin) return false;
      const path = decodeURIComponent(url.pathname);
      if (path === "/api" || path.startsWith("/api/")) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }, "Invalid desktop destination.");

/** @param {string} path */
export function desktopLink(path) {
  return `${desktopScheme}://open${desktopPath.parse(path)}`;
}

/** @param {string} value @param {string} rendererOrigin @returns {string | null} */
export function resolveDesktopLink(value, rendererOrigin) {
  try {
    const url = new URL(value);
    const isOpenLink = url.protocol === `${desktopScheme}:` && url.host === "open";
    const hasCredentials = url.username || url.password;
    if (!isOpenLink || hasCredentials) return null;
    const path = desktopPath.safeParse(`${url.pathname}${url.search}${url.hash}`);
    return path.success ? new URL(path.data, rendererOrigin).href : null;
  } catch {
    return null;
  }
}
