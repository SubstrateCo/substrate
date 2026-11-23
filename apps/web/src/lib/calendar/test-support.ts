import type {
  CalendarAccountView,
  CalendarEventSummary,
  CalendarView,
} from "@substrate/contracts/calendar";

export function calendarView(
  overrides: Partial<CalendarView> & Pick<CalendarView, "name">,
): CalendarView {
  return {
    entityId: crypto.randomUUID(),
    provider: "google",
    credentialAccountId: "account",
    providerCalendarId: overrides.name,
    color: null,
    timeZone: null,
    isPrimary: false,
    recordsInteractions: false,
    syncStatus: "active",
    syncErrorCode: null,
    lastSyncedAt: null,
    interactionsFrom: "2026-01-01T00:00:00.000Z",
    syncWindowStart: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

export function calendarAccount(
  overrides: Partial<CalendarAccountView> & Pick<CalendarAccountView, "credentialAccountId">,
): CalendarAccountView {
  return {
    provider: "google",
    email: null,
    hasCalendarAccess: true,
    calendars: [],
    ...overrides,
  };
}

export function calendarEvent(
  overrides: Partial<CalendarEventSummary> & Pick<CalendarEventSummary, "startsAt" | "endsAt">,
): CalendarEventSummary {
  return {
    entityId: crypto.randomUUID(),
    calendarEntityId: "calendar",
    calendarName: "Work",
    color: null,
    title: "Event",
    allDay: false,
    status: "confirmed",
    kind: "default",
    location: null,
    conferenceUrl: null,
    attendeeCount: 2,
    selfResponseStatus: "accepted",
    ...overrides,
  };
}
