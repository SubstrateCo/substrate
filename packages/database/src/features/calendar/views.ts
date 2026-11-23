import type {
  AttendeeResponseStatus,
  CalendarEventSummary,
  CalendarView,
} from "@substrate/contracts/calendar";

import type { calendarEvents, calendars } from "./schema";

type CalendarRow = typeof calendars.$inferSelect;
type EventRow = typeof calendarEvents.$inferSelect;

// An unlinked account leaves a NULL credential and the stored status unchanged; it reads as
// disconnected.
export function effectiveSyncStatus(row: Pick<CalendarRow, "credentialAccountId" | "syncStatus">) {
  return row.credentialAccountId ? row.syncStatus : "disconnected";
}

export function presentCalendar(row: CalendarRow): CalendarView {
  return {
    entityId: row.entityId,
    provider: row.provider,
    credentialAccountId: row.credentialAccountId,
    providerCalendarId: row.providerCalendarId,
    name: row.name,
    color: row.color,
    timeZone: row.timeZone,
    isPrimary: row.isPrimary,
    recordsInteractions: row.recordsInteractions,
    syncStatus: effectiveSyncStatus(row),
    syncErrorCode: row.syncErrorCode,
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
    interactionsFrom: row.interactionsFrom.toISOString(),
    syncWindowStart: row.syncWindowStart.toISOString(),
  };
}

export function presentEventSummary(
  event: EventRow,
  calendar: Pick<CalendarRow, "name" | "color">,
  attendeeCount: number,
  selfResponseStatus: AttendeeResponseStatus | null,
): CalendarEventSummary {
  return {
    entityId: event.entityId,
    calendarEntityId: event.calendarEntityId,
    calendarName: calendar.name,
    color: calendar.color,
    title: event.title,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    allDay: event.allDay,
    status: event.status,
    kind: event.kind,
    location: event.location,
    conferenceUrl: event.conferenceUrl,
    attendeeCount,
    selfResponseStatus,
  };
}
