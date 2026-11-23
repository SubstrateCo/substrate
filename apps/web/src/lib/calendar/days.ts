import type { CalendarEventSummary } from "@substrate/contracts/calendar";

import {
  formatDateOnly,
  formatDateRange,
  formatDateTime,
  formatDayLabel,
  formatTime,
  formatTimeRange,
  isSameDay,
  parseDateOnly,
} from "@/lib/format/date";

export type CalendarViewMode = "agenda" | "week";
type CalendarEventTimes = Pick<CalendarEventSummary, "startsAt" | "endsAt" | "allDay">;

/** The agenda shows two weeks from its first day. */
export const agendaDays = 14;

export const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());
// Calendar arithmetic, not milliseconds, so a daylight saving change never shifts a day.
export const addDays = (date: Date, days: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
/** Weeks start on Sunday. */
export const startOfWeek = (date: Date) => addDays(startOfDay(date), -date.getDay());

/** The day a view is anchored to: the `date` search value, or today. */
export function viewAnchor(date: string | undefined, now: Date = new Date()) {
  return (date && parseDateOnly(date)) || startOfDay(now);
}

/** The local days a view shows, in order. */
export function visibleDays(view: CalendarViewMode, anchor: Date): Date[] {
  const first = view === "week" ? startOfWeek(anchor) : startOfDay(anchor);
  const count = view === "week" ? 7 : agendaDays;
  return Array.from({ length: count }, (_, index) => addDays(first, index));
}

/** The anchor one page earlier or later. */
export function shiftAnchor(view: CalendarViewMode, anchor: Date, direction: 1 | -1) {
  return formatDateOnly(addDays(anchor, direction * (view === "week" ? 7 : agendaDays)));
}

/**
 * The period to request for some days. All-day events start at UTC midnight, which can fall on
 * the day before or after in local time, so the request reaches one day further on each side.
 */
export function eventRange(days: readonly Date[]) {
  return {
    from: addDays(days[0]!, -1).toISOString(),
    until: addDays(days.at(-1)!, 2).toISOString(),
  };
}

// An all-day event's date, read from its UTC midnight, as a local day.
function utcDateAsLocal(value: string) {
  const date = new Date(value);
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** When an event starts and ends in local time. All-day events cover whole local days. */
export function eventSpan(event: CalendarEventTimes) {
  if (!event.allDay) return { start: new Date(event.startsAt), end: new Date(event.endsAt) };
  const start = utcDateAsLocal(event.startsAt);
  const end = utcDateAsLocal(event.endsAt);
  return { start, end: end > start ? end : addDays(start, 1) };
}

/** Whether an event is over, so views can quiet it beside what is still to come. */
export const eventEnded = (event: CalendarEventTimes, now: Date | number) =>
  eventSpan(event).end.getTime() <= new Date(now).getTime();

/** Whether an event covers part of a local day. An event that ends at midnight ends the day before. */
export function eventOnDay(event: CalendarEventTimes, day: Date) {
  const { start, end } = eventSpan(event);
  const dayStart = startOfDay(day);
  const dayEnd = addDays(dayStart, 1);
  if (start.getTime() === end.getTime()) return start >= dayStart && start < dayEnd;
  return start < dayEnd && end > dayStart;
}

/** All-day events first, then by start, longer first, then by title. */
export function compareEvents(a: CalendarEventSummary, b: CalendarEventSummary) {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  return (
    Date.parse(a.startsAt) - Date.parse(b.startsAt) ||
    Date.parse(b.endsAt) - Date.parse(a.endsAt) ||
    a.title.localeCompare(b.title) ||
    a.entityId.localeCompare(b.entityId)
  );
}

/** An event's title, or a stand-in when the provider has none. */
export const eventTitle = (title: string) => title.trim() || "Untitled event";

/** The local day an event starts on, for links to the calendar: YYYY-MM-DD. */
export const eventDate = (event: CalendarEventTimes) => formatDateOnly(eventSpan(event).start);

/** An event's time on one agenda day: "9:00 AM – 10:00 AM", or how it continues across days. */
export function agendaTimeLabel(event: CalendarEventTimes, day: Date) {
  if (event.allDay) return "All day";
  const { start, end } = eventSpan(event);
  const dayStart = startOfDay(day);
  const dayEnd = addDays(dayStart, 1);
  const startsBefore = start < dayStart;
  const endsAfter = end > dayEnd;
  if (startsBefore && endsAfter) return "All day";
  if (startsBefore) return `Until ${formatTime(end)}`;
  if (endsAfter) return `From ${formatTime(start)}`;
  return formatTimeRange(start, end);
}

/** When an event happens, for its details: "Today · 9:00 AM – 10:00 AM" or "Nov 23 – 24 · All day". */
export function eventWhenLabel(event: CalendarEventTimes, now: Date | number = Date.now()) {
  const { start, end } = eventSpan(event);
  if (event.allDay) {
    const last = addDays(end, -1);
    const days = isSameDay(start, last)
      ? formatDayLabel(start, now)
      : formatDateRange(start, last, now);
    return `${days} · All day`;
  }
  const lastMoment = new Date(end.getTime() - 1);
  if (end <= start || isSameDay(start, lastMoment))
    return `${formatDayLabel(start, now)} · ${formatTimeRange(start, end)}`;
  return `${formatDateTime(start, now)} – ${formatDateTime(end, now)}`;
}

export interface AgendaDay {
  /** YYYY-MM-DD of the local day. */
  key: string;
  day: Date;
  allDay: CalendarEventSummary[];
  timed: CalendarEventSummary[];
}

/**
 * The agenda: each day that has events, in order. An event that spans days appears on each day.
 * `keep` stays in the list without events, so today always has a heading.
 */
export function groupEventsByDay(
  events: readonly CalendarEventSummary[],
  days: readonly Date[],
  keep?: Date,
): AgendaDay[] {
  const sorted = [...events].sort(compareEvents);
  const kept = keep && formatDateOnly(keep);
  return days.flatMap((day) => {
    const key = formatDateOnly(day);
    const on = sorted.filter((event) => eventOnDay(event, day));
    if (!on.length && key !== kept) return [];
    return [
      {
        key,
        day,
        allDay: on.filter((event) => event.allDay),
        timed: on.filter((event) => !event.allDay),
      },
    ];
  });
}
