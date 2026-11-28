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

export type CalendarViewMode = "agenda" | "week" | "month";
type CalendarEventTimes = Pick<CalendarEventSummary, "startsAt" | "endsAt" | "allDay">;

const agendaDays = 14;

export const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());
export const addDays = (date: Date, days: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const startOfWeek = (date: Date) => addDays(startOfDay(date), -date.getDay());

export function viewAnchor(date: string | undefined, now: Date = new Date()) {
  return (date && parseDateOnly(date)) || startOfDay(now);
}

export function visibleDays(view: CalendarViewMode, anchor: Date): Date[] {
  if (view === "month") {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const count = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
    return Array.from({ length: count }, (_, index) => addDays(first, index));
  }
  const first = view === "week" ? startOfWeek(anchor) : startOfDay(anchor);
  const count = view === "week" ? 7 : agendaDays;
  return Array.from({ length: count }, (_, index) => addDays(first, index));
}

export function shiftAnchor(view: CalendarViewMode, anchor: Date, direction: 1 | -1) {
  if (view === "month") {
    const first = new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1);
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    return formatDateOnly(
      new Date(first.getFullYear(), first.getMonth(), Math.min(anchor.getDate(), last)),
    );
  }
  return formatDateOnly(addDays(anchor, direction * (view === "week" ? 7 : agendaDays)));
}

const allDayUtcDriftDays = 1;

export function eventRange(days: readonly Date[]) {
  const firstDay = days[0]!;
  const dayAfterLast = addDays(days.at(-1)!, 1);
  return {
    from: addDays(firstDay, -allDayUtcDriftDays).toISOString(),
    until: addDays(dayAfterLast, allDayUtcDriftDays).toISOString(),
  };
}

function utcDateAsLocal(value: string) {
  const date = new Date(value);
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function eventSpan(event: CalendarEventTimes) {
  if (!event.allDay) return { start: new Date(event.startsAt), end: new Date(event.endsAt) };
  const start = utcDateAsLocal(event.startsAt);
  const end = utcDateAsLocal(event.endsAt);
  return { start, end: end > start ? end : addDays(start, 1) };
}

export const eventEnded = (event: CalendarEventTimes, now: Date | number) =>
  eventSpan(event).end.getTime() <= new Date(now).getTime();

export function eventOnDay(event: CalendarEventTimes, day: Date) {
  const { start, end } = eventSpan(event);
  const dayStart = startOfDay(day);
  const dayEnd = addDays(dayStart, 1);
  if (start.getTime() === end.getTime()) return start >= dayStart && start < dayEnd;
  return start < dayEnd && end > dayStart;
}

export function compareEvents(a: CalendarEventSummary, b: CalendarEventSummary) {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  return (
    Date.parse(a.startsAt) - Date.parse(b.startsAt) ||
    Date.parse(b.endsAt) - Date.parse(a.endsAt) ||
    a.title.localeCompare(b.title) ||
    a.entityId.localeCompare(b.entityId)
  );
}

export const eventTitle = (title: string) => title.trim() || "Untitled event";

export const eventDate = (event: CalendarEventTimes) => formatDateOnly(eventSpan(event).start);

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
  key: string;
  day: Date;
  allDay: CalendarEventSummary[];
  timed: CalendarEventSummary[];
}

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
