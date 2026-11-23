import { calendarProviders } from "@substrate/contracts/calendar";
import { googleBaseScopes } from "@substrate/contracts/integrations/google";

import type { ServerEnvironment } from "../environment";
import { z } from "zod";

type CalendarProviderConfig = ServerEnvironment["calendarProviders"];

/**
 * Social providers exist only to link integration accounts to a signed-in user.
 *
 * Google uses incremental consent. The provider asks only for the identity scopes; each product
 * link adds its own scopes through `linkSocial({ scopes: googleProductScopes[product] })`.
 * `includeGrantedScopes` keeps earlier grants in the new token, and Better Auth merges the
 * returned scopes into the existing `account.scope` when the same account is linked again.
 * `accessType: "offline"` with `prompt: "consent"` makes Google issue a refresh token on every
 * link, including a second link of the same account.
 */
export function calendarSocialProviders(config: CalendarProviderConfig) {
  return {
    ...(config.google && {
      google: {
        clientId: config.google.clientId,
        clientSecret: config.google.clientSecret,
        disableDefaultScope: true,
        scope: [...googleBaseScopes],
        includeGrantedScopes: true,
        accessType: "offline" as const,
        prompt: "consent" as const,
        disableSignUp: true,
        disableImplicitSignUp: true,
      },
    }),
    // Microsoft is not implemented: add `microsoft` here with its calendar scope when an adapter
    // exists in v1/calendar/providers.ts.
  };
}

/** The provider a Better Auth request body names, if any. */
export const requestedProvider = z.object({ provider: z.string() }).catch({ provider: "" });

/**
 * Calendar providers are not sign-in methods. Better Auth starts every social sign-in, including
 * the Electron OAuth proxy, at `/sign-in/social`; linking uses `/link-social` and stays allowed.
 * The OAuth callback only completes flows that one of those endpoints started.
 */
export function isCalendarProviderSignIn(path: string | undefined, provider: string) {
  if (path !== "/sign-in/social") return false;
  return calendarProviders.some((calendarProvider) => calendarProvider === provider);
}
