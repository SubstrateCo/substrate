import { linkOptions } from "@tanstack/react-router";

import type { ElectronAuthorization } from "../desktop/authorization-query";
import { z } from "zod";
// oxlint-disable-next-line deslop/no-unknown-parameters -- Search parameters are untrusted router input; validate them at this boundary.
export function safeRedirect(value: unknown, fallback = "/dashboard"): string {
  // oxlint-disable-next-line deslop/no-runtime-typeof -- Reject non-string router input before inspecting the redirect path.
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//"))
    return fallback;
  try {
    const decoded = decodeURIComponent(value);
    // oxlint-disable-next-line no-control-regex -- Reject URL controls and backslashes before URL normalization.
    if (/[\\\u0000-\u0020\u007f]/.test(decoded) || decoded.startsWith("//")) return fallback;
    const url = new URL(value, "https://startup.invalid");
    if (
      url.origin !== "https://startup.invalid" ||
      url.pathname.startsWith("//") ||
      url.pathname.startsWith("/api/")
    )
      return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

// A malformed value falls back to absent, so a bad link still opens the page.
const text = z.string().optional().catch(undefined);

/** Search params for the public auth pages. */
export const authSearch = z.object({
  redirect: text.transform((value) => safeRedirect(value, "/onboarding")),
  email: text.transform((value) => value ?? ""),
  token: text.transform((value) => value ?? ""),
  error: text.transform((value) => value ?? ""),
  client_id: text,
  state: text,
  code_challenge: text,
});

export type AuthPath =
  | "/login"
  | "/signup"
  | "/verify-email"
  | "/forgot-password"
  | "/reset-password";

/** An auth page that keeps the destination and, when present, the desktop sign-in handoff. */
export function authLink(
  to: AuthPath,
  redirect: string,
  email?: string,
  authorization?: ElectronAuthorization,
) {
  return linkOptions({
    to,
    search: { redirect: safeRedirect(redirect), ...(email && { email }), ...authorization },
  });
}
