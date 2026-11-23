import {
  formatDateTime,
  formatDateOnly,
  formatDateTimeInZone,
  formatDayLabel,
  formatMailListDate,
  formatDueDate,
  formatRelativeTime,
  formatShortDate,
  formatTimeZone,
  formatZonedDateTime,
  parseDateOnly,
} from "./date";
import { expect, test } from "bun:test";

const now = new Date(2026, 10, 8, 12, 0).getTime();
const ago = (ms: number) => new Date(now - ms).toISOString();

test("a schedule's next run reads in the schedule's own zone", () => {
  const instant = "2026-11-10T14:00:00.000Z";
  expect(formatDateTimeInZone(instant, "America/New_York", now)).toBe("Nov 10, 9:00 AM");
  expect(formatDateTimeInZone(instant, "Europe/Berlin", now)).toBe("Nov 10, 3:00 PM");
});

test("a zoned moment names the weekday and the zone", () => {
  const instant = "2026-11-10T14:00:00.000Z";
  expect(formatZonedDateTime(instant, "America/New_York")).toBe("Tue, Nov 10, 9:00 AM EST");
});

test("a time zone label has a readable name and its UTC offset", () => {
  const winter = "2026-11-10T14:00:00.000Z";
  expect(formatTimeZone("America/New_York", winter)).toBe("America / New York · UTC−5");
  expect(formatTimeZone("UTC", winter)).toBe("UTC");
});

test("recent events use compact relative units", () => {
  expect(formatRelativeTime(ago(30_000), now)).toBe("now");
  expect(formatRelativeTime(ago(5 * 60_000), now)).toBe("5m");
  expect(formatRelativeTime(ago(3 * 3_600_000), now)).toBe("3h");
  expect(formatRelativeTime(ago(6 * 86_400_000), now)).toBe("6d");
});

test("day dividers name today and yesterday, then the weekday and date", () => {
  expect(formatDayLabel(new Date(2026, 10, 8, 0, 5), now)).toBe("Today");
  expect(formatDayLabel(new Date(2026, 10, 7, 23, 59), now)).toBe("Yesterday");
  expect(formatDayLabel(new Date(2026, 10, 2, 9), now)).toBe("Monday, November 2");
  expect(formatDayLabel(new Date(2025, 10, 2, 9), now)).toBe("Sunday, November 2, 2025");
});
test("mail list dates switch at local midnight, not after 24 hours", () => {
  const today = new Date(2026, 10, 22, 0, 2);
  expect(formatMailListDate(new Date(2026, 10, 22, 0, 1), today)).toBe("12:01 AM");
  expect(formatMailListDate(new Date(2026, 10, 21, 23, 59), today)).toBe("Nov 21");
  expect(formatMailListDate(new Date(2025, 10, 22, 17), today)).toBe("Nov 22, 2025");
});

test("events a week or older show a date, with the year only outside the current year", () => {
  expect(formatRelativeTime(new Date(2026, 9, 3, 9).toISOString(), now)).toBe("Oct 3");
  expect(formatRelativeTime(new Date(2025, 9, 3, 9).toISOString(), now)).toBe("Oct 3, 2025");
  expect(formatShortDate(new Date(2025, 9, 3, 9), now)).toBe("Oct 3, 2025");
});

test("date and time keep the short date and add the time of day", () => {
  expect(formatDateTime(new Date(2026, 10, 8, 15, 40), now)).toBe("Nov 8, 3:40 PM");
});

test("due dates read relative to today and mark late work", () => {
  expect(formatDueDate("2026-11-08", now)).toMatchObject({ label: "Today", state: "today" });
  expect(formatDueDate("2026-11-09", now)).toMatchObject({
    label: "Tomorrow",
    state: "tomorrow",
  });
  expect(formatDueDate("2026-11-04", now)).toMatchObject({ label: "Nov 4", state: "overdue" });
  expect(formatDueDate("2026-12-01", now)).toMatchObject({ label: "Dec 1", state: "upcoming" });
  expect(formatDueDate("not a date", now)).toBeUndefined();
});

test("a stored calendar date does not shift to the previous day", () => {
  expect(parseDateOnly("2026-11-04")?.getDate()).toBe(4);
});

test("date-only query inputs use the local calendar date with padded month and day", () => {
  expect(formatDateOnly(new Date(2026, 0, 4, 0, 5))).toBe("2026-01-04");
  expect(formatDateOnly(new Date(2026, 10, 21, 23, 55))).toBe("2026-11-21");
});
