import { googleProducts, type GoogleProduct } from "./google.ts";
import { z } from "zod";

export const googleProduct = z.enum(googleProducts);
export const googleLinkTicketInput = z.object({ product: googleProduct });

/** A single-use link ticket: 32 random bytes, base64url without padding. */
export const googleLinkTicket = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

/** The settings page that each product's link returns to. */
export const googleProductSettingsPath = {
  calendar: "/settings/user/calendars",
} as const satisfies Record<GoogleProduct, string>;

/** The public API page that turns a ticket into Google's consent screen in the system browser. */
export const googleLinkStartPath = "/api/v1/integrations/google/link/start";
/** Any value reaches the start page, which shows its expired page for a bad ticket. */
export const googleLinkStartQuery = z.object({ ticket: z.string().catch("") });

/** Builds the start page on the API origin. Throws when the ticket is malformed. */
export function googleLinkStartURL(ticket: string, apiURL: string) {
  const url = new URL(googleLinkStartPath, new URL(apiURL).origin);
  url.searchParams.set("ticket", googleLinkTicket.parse(ticket));
  return url.href;
}

/** Whether a URL is Google's OAuth consent screen. Links go nowhere else. */
export function isGoogleConsentURL(value: string | undefined) {
  const url = URL.parse(value ?? "");
  return (
    url?.protocol === "https:" &&
    url.host === "accounts.google.com" &&
    !url.username &&
    !url.password
  );
}
