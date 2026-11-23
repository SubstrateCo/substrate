import {
  calendarProviders,
  implementedCalendarProviders,
  type CalendarProvider,
  type ProviderCalendar,
  type ProviderSyncResult,
} from "@substrate/contracts/calendar";

import type { ServerEnvironment } from "../../environment";
import { googleAccessToken, type GoogleTokenSource } from "../../integrations/google";
import { ProviderNotConfigured, ProviderNotImplemented } from "./errors";
import { createGoogleCalendar } from "./google";

/** The owner's linked provider account. `accountId` is the Better Auth `account.id`. */
export interface CalendarAccountRef {
  userId: string;
  accountId: string;
}

/**
 * A read-only calendar API. It loads the account's token itself and throws its integration's
 * errors, such as those in `integrations/google`.
 */
export interface CalendarProviderAdapter {
  listCalendars(account: CalendarAccountRef): Promise<ProviderCalendar[]>;
  syncEvents(
    account: CalendarAccountRef,
    input: {
      providerCalendarId: string;
      /** Null requests a full sync of the window. */
      syncCursor: string | null;
      syncWindowStart: Date;
      now: Date;
    },
  ): Promise<ProviderSyncResult>;
}

export interface CalendarProviders {
  /** Providers this server can connect: implemented and configured. */
  configured: CalendarProvider[];
  /** Throws ProviderNotImplemented or ProviderNotConfigured for a provider without an adapter. */
  adapter(provider: CalendarProvider): CalendarProviderAdapter;
}

export function createCalendarProviders(
  config: ServerEnvironment["calendarProviders"],
  auth: GoogleTokenSource,
): CalendarProviders {
  const adapters: Record<CalendarProvider, CalendarProviderAdapter | undefined> = {
    google:
      config.google &&
      createGoogleCalendar({
        accessToken: (account) => googleAccessToken({ auth, ...account, product: "calendar" }),
      }),
    // Not implemented. A Microsoft Graph adapter plugs in here, with its social provider in
    // auth/calendar-accounts.ts. Until then, claimed Microsoft calendars retry with
    // `provider_not_implemented`.
    microsoft: undefined,
  };
  return {
    configured: calendarProviders.filter((provider) => adapters[provider] !== undefined),
    adapter(provider) {
      const adapter = adapters[provider];
      if (adapter) return adapter;
      if (implementedCalendarProviders.some((implemented) => implemented === provider))
        throw new ProviderNotConfigured();
      throw new ProviderNotImplemented();
    },
  };
}
