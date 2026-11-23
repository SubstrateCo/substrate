import {
  agendaTimeLabel,
  eventDate,
  eventEnded,
  eventOnDay,
  eventTitle,
  eventWhenLabel,
  eventRange,
  groupEventsByDay,
  shiftAnchor,
  viewAnchor,
  visibleDays,
} from "./days";
import { calendarEvent } from "./test-support";
import { expect, test } from "bun:test";

const local = (day: number, hour = 0, minute = 0) =>
  new Date(2026, 10, day, hour, minute).toISOString();

test("the week view starts on Sunday and the agenda on its anchor day", () => {
  const wednesday = new Date(2026, 10, 25);
  const week = visibleDays("week", wednesday);
  expect(week).toHaveLength(7);
  expect(week[0]).toEqual(new Date(2026, 10, 22));
  expect(week[6]).toEqual(new Date(2026, 10, 28));
  const agenda = visibleDays("agenda", wednesday);
  expect(agenda).toHaveLength(14);
  expect(agenda[0]).toEqual(wednesday);
});

test("paging moves a week view by a week and the agenda by its length", () => {
  const anchor = new Date(2026, 10, 25);
  expect(shiftAnchor("week", anchor, 1)).toBe("2026-12-02");
  expect(shiftAnchor("week", anchor, -1)).toBe("2026-11-18");
  expect(shiftAnchor("agenda", anchor, 1)).toBe("2026-12-09");
});

test("an invalid date search value falls back to today", () => {
  const now = new Date(2026, 10, 22, 15, 30);
  expect(viewAnchor("2026-11-25", now)).toEqual(new Date(2026, 10, 25));
  expect(viewAnchor("tomorrow", now)).toEqual(new Date(2026, 10, 22));
  expect(viewAnchor(undefined, now)).toEqual(new Date(2026, 10, 22));
});

test("the requested period stays within the server's 42-day limit", () => {
  const { from, until } = eventRange(visibleDays("agenda", new Date(2026, 10, 22)));
  const days = (Date.parse(until) - Date.parse(from)) / 86_400_000;
  expect(days).toBeLessThanOrEqual(42);
  expect(Date.parse(from)).toBeLessThan(new Date(2026, 10, 22).getTime());
});

test("an all-day event covers its local dates, whatever the viewer's time zone", () => {
  const event = calendarEvent({
    allDay: true,
    startsAt: "2026-11-23T00:00:00.000Z",
    endsAt: "2026-11-25T00:00:00.000Z",
  });
  expect(eventOnDay(event, new Date(2026, 10, 22))).toBe(false);
  expect(eventOnDay(event, new Date(2026, 10, 23))).toBe(true);
  expect(eventOnDay(event, new Date(2026, 10, 24))).toBe(true);
  expect(eventOnDay(event, new Date(2026, 10, 25))).toBe(false);
});

test("a meeting that ends at midnight does not appear on the next day", () => {
  const event = calendarEvent({ startsAt: local(23, 22), endsAt: local(24) });
  expect(eventOnDay(event, new Date(2026, 10, 23))).toBe(true);
  expect(eventOnDay(event, new Date(2026, 10, 24))).toBe(false);
});

test("the agenda groups by day, puts all-day events first, and repeats events that span days", () => {
  const days = visibleDays("agenda", new Date(2026, 10, 22));
  const late = calendarEvent({ title: "Late", startsAt: local(23, 15), endsAt: local(23, 16) });
  const early = calendarEvent({ title: "Early", startsAt: local(23, 9), endsAt: local(23, 10) });
  const trip = calendarEvent({
    title: "Trip",
    allDay: true,
    startsAt: "2026-11-23T00:00:00.000Z",
    endsAt: "2026-11-25T00:00:00.000Z",
  });
  const overnight = calendarEvent({
    title: "Overnight",
    startsAt: local(24, 23),
    endsAt: local(25, 1),
  });
  const groups = groupEventsByDay([late, overnight, trip, early], days);
  expect(groups.map((group) => group.key)).toEqual(["2026-11-23", "2026-11-24", "2026-11-25"]);
  expect(groups[0]!.allDay.map((event) => event.title)).toEqual(["Trip"]);
  expect(groups[0]!.timed.map((event) => event.title)).toEqual(["Early", "Late"]);
  expect(groups[1]!.allDay.map((event) => event.title)).toEqual(["Trip"]);
  expect(groups[1]!.timed.map((event) => event.title)).toEqual(["Overnight"]);
  expect(groups[2]!.timed.map((event) => event.title)).toEqual(["Overnight"]);
});

test("an agenda row says how an event that spans days continues", () => {
  const overnight = calendarEvent({ startsAt: local(23, 22), endsAt: local(25, 1, 30) });
  expect(agendaTimeLabel(overnight, new Date(2026, 10, 23))).toBe("From 10:00 PM");
  expect(agendaTimeLabel(overnight, new Date(2026, 10, 24))).toBe("All day");
  expect(agendaTimeLabel(overnight, new Date(2026, 10, 25))).toBe("Until 1:30 AM");
  const meeting = calendarEvent({ startsAt: local(23, 9), endsAt: local(23, 9, 30) });
  expect(agendaTimeLabel(meeting, new Date(2026, 10, 23))).toBe("9:00 AM – 9:30 AM");
});

test("an event without a title still has a name, and links open its local start day", () => {
  expect(eventTitle("  ")).toBe("Untitled event");
  expect(eventTitle("Sync")).toBe("Sync");
  const holiday = calendarEvent({
    allDay: true,
    startsAt: "2026-11-26T00:00:00.000Z",
    endsAt: "2026-11-27T00:00:00.000Z",
  });
  expect(eventDate(holiday)).toBe("2026-11-26");
});

test("event details say when it happens, across days when needed", () => {
  const now = new Date(2026, 10, 22, 8);
  expect(
    eventWhenLabel(calendarEvent({ startsAt: local(22, 9), endsAt: local(22, 10) }), now),
  ).toBe("Today · 9:00 AM – 10:00 AM");
  expect(eventWhenLabel(calendarEvent({ startsAt: local(23, 23), endsAt: local(24) }), now)).toBe(
    "Monday, November 23 · 11:00 PM – 12:00 AM",
  );
  expect(
    eventWhenLabel(calendarEvent({ startsAt: local(23, 22), endsAt: local(24, 2) }), now),
  ).toBe("Nov 23, 10:00 PM – Nov 24, 2:00 AM");
  expect(
    eventWhenLabel(
      calendarEvent({
        allDay: true,
        startsAt: "2026-11-23T00:00:00.000Z",
        endsAt: "2026-11-25T00:00:00.000Z",
      }),
      now,
    ),
  ).toBe("Nov 23 – 24 · All day");
});

test("the agenda keeps today's heading when today has no events", () => {
  const today = new Date(2026, 10, 22);
  const days = visibleDays("agenda", today);
  const event = calendarEvent({ startsAt: local(24, 9), endsAt: local(24, 10) });
  expect(groupEventsByDay([event], days, today).map((group) => group.key)).toEqual([
    "2026-11-22",
    "2026-11-24",
  ]);
});

test("an event has ended once its end passes, and an all-day event at the end of its day", () => {
  const meeting = calendarEvent({ startsAt: local(22, 9), endsAt: local(22, 10) });
  expect(eventEnded(meeting, new Date(2026, 10, 22, 9, 59))).toBe(false);
  expect(eventEnded(meeting, new Date(2026, 10, 22, 10))).toBe(true);
  const offsite = calendarEvent({
    allDay: true,
    startsAt: "2026-11-22T00:00:00.000Z",
    endsAt: "2026-11-23T00:00:00.000Z",
  });
  expect(eventEnded(offsite, new Date(2026, 10, 22, 23, 59))).toBe(false);
  expect(eventEnded(offsite, new Date(2026, 10, 23))).toBe(true);
});
