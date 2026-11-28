import { calendarProviders } from "@substrate/contracts/calendar";
import {
  googleBaseScopes,
  googleProductScopes,
  parseGrantedScopes,
} from "@substrate/contracts/integrations/google";

import type { ServerEnvironment } from "../environment";
import { APIError } from "better-auth/api";
import { z } from "zod";

type CalendarProviderConfig = ServerEnvironment["calendarProviders"];

export function calendarSocialProviders(config: CalendarProviderConfig) {
  return {
    ...(config.google && {
      google: {
        clientId: config.google.clientId,
        clientSecret: config.google.clientSecret,
        disableDefaultScope: true,
        scope: [...googleBaseScopes],
        includeGrantedScopes: false,
        accessType: "offline" as const,
        prompt: "consent" as const,
        disableSignUp: true,
        disableImplicitSignUp: true,
      },
    }),
  };
}

export const requestedProvider = z.object({ provider: z.string() }).catch({ provider: "" });

const serverScopes = new Set<string>([
  ...googleBaseScopes,
  ...Object.values(googleProductScopes).flat(),
  // Google's token response can spell its email and profile scopes as canonical URLs.
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
]);
export const googleRedirectLink = z.strictObject({
  provider: z.literal("google"),
  callbackURL: z.string().optional(),
  errorCallbackURL: z.string().optional(),
  disableRedirect: z.boolean().optional(),
  loginHint: z.string().optional(),
  scopes: z.array(z.string().refine((s) => serverScopes.has(s))).optional(),
});

/** Better Auth supplies providerId on new links and relinks; ordinary token refreshes
 * update the already-bound account. Reject a broader returned grant before the SQL write. */
export async function checkGoogleGrantForStorage(account: {
  providerId?: string;
  scope?: string | null;
}) {
  if (account.providerId !== "google") return;
  const scopes = parseGrantedScopes(account.scope ?? null);
  if (!scopes.length || scopes.some((s) => !serverScopes.has(s)))
    throw new APIError("FORBIDDEN", {
      message: "Google returned unsupported permissions for this connection.",
    });
}

/**
 * Calendar providers are not sign-in methods. Better Auth starts every social sign-in, including
 * the Electron OAuth proxy, at `/sign-in/social`; linking uses `/link-social` and stays allowed.
 * The OAuth callback only completes flows that one of those endpoints started.
 */
export function isCalendarProviderSignIn(path: string | undefined, provider: string) {
  if (path !== "/sign-in/social") return false;
  return calendarProviders.some((calendarProvider) => calendarProvider === provider);
}
