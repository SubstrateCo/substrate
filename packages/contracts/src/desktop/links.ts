import { hasUnsafePathCharacter } from "../paths.ts";
import type { DesktopScheme } from "./identity.ts";
import { z } from "zod";

export const desktopOrigin = "https://desktop.substrate.local";
export const desktopInstallationHeader = "x-substrate-installation";

export const desktopPath = z
  .string()
  .min(1)
  .max(16_384)
  .refine((value) => {
    try {
      const decoded = decodeURIComponent(value);
      const invalidCharacters = hasUnsafePathCharacter(decoded);
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

export function desktopLink(path: string, scheme: DesktopScheme = "substrate") {
  return `${scheme}://open${desktopPath.parse(path)}`;
}

/** The public /desktop/open page for a destination. Throws when the validator rejects it. */
export function desktopHandoffURL(path: string, apiURL: string) {
  const url = new URL("/desktop/open", apiURL);
  url.searchParams.set("path", desktopPath.parse(path));
  return url.toString();
}

export function resolveDesktopLink(
  value: string,
  rendererOrigin: string,
  scheme: DesktopScheme = "substrate",
): string | null {
  try {
    const url = new URL(value);
    const isOpenLink = url.protocol === `${scheme}:` && url.host === "open";
    const hasCredentials = url.username || url.password;
    if (!isOpenLink || hasCredentials) return null;
    const path = desktopPath.safeParse(`${url.pathname}${url.search}${url.hash}`);
    return path.success ? new URL(path.data, rendererOrigin).href : null;
  } catch {
    return null;
  }
}
