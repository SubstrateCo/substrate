import type {
  CalendarAccountView,
  CalendarView,
  ProviderCalendar,
} from "@substrate/contracts/calendar";
import type { Committed } from "@substrate/database";

import { scopeFixture } from "../../test-support";
import {
  CalendarAccessRequired,
  CalendarProviderFailure,
  ProviderNotConfigured,
  ProviderNotImplemented,
} from "./errors";
import type { CalendarProviderAdapter, CalendarProviders } from "./providers";
import { createCalendarService } from "./service";
import { expect, test } from "bun:test";

const calendarView = (providerCalendarId: string): CalendarView => ({
  entityId: `entity-${providerCalendarId}`,
  provider: "google",
  credentialAccountId: "account-1",
  providerCalendarId,
  name: "Stored name",
  color: null,
  timeZone: null,
  isPrimary: false,
  recordsInteractions: true,
  syncStatus: "active",
  syncErrorCode: null,
  lastSyncedAt: null,
  interactionsFrom: "2026-11-01T00:00:00.000Z",
  syncWindowStart: "2026-10-01T00:00:00.000Z",
});
const providerCalendar = (providerCalendarId: string, name: string): ProviderCalendar => ({
  providerCalendarId,
  name,
  color: "#0b8043",
  timeZone: "America/Toronto",
  isPrimary: providerCalendarId === "primary",
});

function fixture(
  options: {
    account?: Partial<CalendarAccountView>;
    listCalendars?: CalendarProviderAdapter["listCalendars"];
  } = {},
) {
  const providerRequests: { userId: string; accountId: string }[] = [];
  const connected: ProviderCalendar[][] = [];
  let triggers = 0;
  const adapter: CalendarProviderAdapter = {
    listCalendars: async (requested) => {
      providerRequests.push(requested);
      if (options.listCalendars) return options.listCalendars(requested);
      return [providerCalendar("primary", "Work"), providerCalendar("team", "Team")];
    },
    syncEvents: async () => {
      throw new Error("Not used.");
    },
  };
  const providers: CalendarProviders = { configured: ["google"], adapter: () => adapter };
  const scope = scopeFixture();
  const account: CalendarAccountView = {
    credentialAccountId: "account-1",
    provider: "google",
    email: "work@example.test",
    hasCalendarAccess: true,
    calendars: [calendarView("primary")],
    ...options.account,
  };
  const committed = <T>(result: T): Committed<T> => ({ result, hints: [] });
  scope.repositories = {
    ...scope.repositories,
    calendar: {
      ...scope.repositories.calendar,
      settings: async () => ({ accounts: [account], detachedCalendars: [] }),
      connect: async (input) => {
        connected.push(input.calendars);
        return committed(
          input.calendars.map((calendar) => calendarView(calendar.providerCalendarId)),
        );
      },
    },
  };
  const service = createCalendarService({
    providers,
    triggerSync: () => {
      triggers++;
    },
    publish: async (value) => value.result,
  });
  return { service, scope, providerRequests, connected, triggers: () => triggers };
}

test("settings name the providers this server can connect", async () => {
  const { service, scope } = fixture();
  expect(await service.settings(scope)).toMatchObject({
    success: true,
    data: { providers: ["google"], accounts: [{ credentialAccountId: "account-1" }] },
  });
});

test("listing marks calendars already connected in this organization", async () => {
  const { service, scope, providerRequests } = fixture();
  const result = await service.providerCalendars(scope, "account-1");
  expect(result).toMatchObject({
    success: true,
    data: [
      { providerCalendarId: "primary", connectedEntityId: "entity-primary" },
      { providerCalendarId: "team", connectedEntityId: null },
    ],
  });
  expect(providerRequests).toEqual([{ userId: scope.userId, accountId: "account-1" }]);
});

test("another user's account is not found and its provider (and token) is never reached", async () => {
  const { service, scope, providerRequests } = fixture();
  expect(await service.providerCalendars(scope, "someone-elses-account")).toMatchObject({
    success: false,
    error: { code: "NOT_FOUND" },
  });
  expect(
    await service.connect(scope, {
      organizationId: scope.organizationId,
      credentialAccountId: "someone-elses-account",
      providerCalendarIds: ["primary"],
    }),
  ).toMatchObject({ success: false, error: { code: "NOT_FOUND" } });
  expect(providerRequests).toEqual([]);
});

test("an account without calendar access asks the owner to reconnect", async () => {
  const withoutScope = fixture({ account: { hasCalendarAccess: false } });
  expect(await withoutScope.service.providerCalendars(withoutScope.scope, "account-1")).toEqual({
    success: false,
    error: {
      code: "FORBIDDEN",
      message: "Reconnect with calendar access.",
      userMessage: "Reconnect with calendar access.",
      reason: "CALENDAR_ACCESS_REQUIRED",
    },
  });
  expect(withoutScope.providerRequests).toEqual([]);

  // The stored grant can claim a scope that the provider no longer honours, or be revoked.
  for (const failure of [
    new CalendarAccessRequired("calendar_scope_missing", "No calendar scope."),
    new CalendarAccessRequired("reauth_required", "Revoked."),
  ]) {
    const rejected = fixture({
      listCalendars: async () => {
        throw failure;
      },
    });
    expect(await rejected.service.providerCalendars(rejected.scope, "account-1")).toMatchObject({
      success: false,
      error: { code: "FORBIDDEN", reason: "CALENDAR_ACCESS_REQUIRED" },
    });
  }
});

test("a provider this server cannot use is unavailable input", async () => {
  for (const failure of [new ProviderNotConfigured(), new ProviderNotImplemented()]) {
    const unavailable = fixture({
      listCalendars: async () => {
        throw failure;
      },
    });
    expect(
      await unavailable.service.providerCalendars(unavailable.scope, "account-1"),
    ).toMatchObject({ success: false, error: { code: "INVALID_INPUT" } });
  }
});

test("any other provider failure stays unexpected", async () => {
  const failing = fixture({
    listCalendars: async () => {
      throw new CalendarProviderFailure("provider_http_503", "The Google request failed.");
    },
  });
  expect(await failing.service.providerCalendars(failing.scope, "account-1")).toMatchObject({
    success: false,
    error: { code: "INTERNAL_ERROR" },
  });
});

test("connect uses the provider's calendars, ignores unknown IDs, and starts a sync", async () => {
  const { service, scope, connected, triggers } = fixture();
  const result = await service.connect(scope, {
    organizationId: scope.organizationId,
    credentialAccountId: "account-1",
    providerCalendarIds: ["team", "not-in-account"],
  });
  expect(result).toMatchObject({ success: true, data: [{ providerCalendarId: "team" }] });
  expect(connected).toEqual([[providerCalendar("team", "Team")]]);
  expect(triggers()).toBe(1);
});

test("connect with only unknown IDs connects nothing", async () => {
  const { service, scope, connected, triggers } = fixture();
  expect(
    await service.connect(scope, {
      organizationId: scope.organizationId,
      credentialAccountId: "account-1",
      providerCalendarIds: ["not-in-account"],
    }),
  ).toMatchObject({ success: false, error: { code: "NOT_FOUND" } });
  expect(connected).toEqual([]);
  expect(triggers()).toBe(0);
});
