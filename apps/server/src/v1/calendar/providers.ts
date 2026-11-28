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

export interface CalendarAccountRef {
  userId: string;
  accountId: string;
}

export interface CalendarProviderAdapter {
  listCalendars(account: CalendarAccountRef): Promise<ProviderCalendar[]>;
  syncEvents(
    account: CalendarAccountRef,
    input: {
      providerCalendarId: string;
      syncCursor: string | null;
      syncWindowStart: Date;
      now: Date;
    },
  ): Promise<ProviderSyncResult>;
}

export interface CalendarProviders {
  configured: CalendarProvider[];
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
