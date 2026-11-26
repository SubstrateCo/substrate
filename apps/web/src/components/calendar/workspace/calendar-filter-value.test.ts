import { hiddenCalendarsValue } from "./calendar-filter-value";
import type { CalendarGroup } from "@/lib/calendar/groups";
import { calendarView } from "@/lib/calendar/test-support";
import { describe, expect, test } from "bun:test";

const groups: CalendarGroup[] = [
  {
    key: "a",
    label: "a@example.com",
    provider: "google",
    calendars: [calendarView({ name: "Work", entityId: "work" })],
  },
  {
    key: "b",
    label: "b@example.com",
    provider: "google",
    calendars: [calendarView({ name: "Home", entityId: "home" })],
  },
];

describe("hidden calendar filter", () => {
  test("hidden calendars read as one 'is not' clause in the order they were hidden", () => {
    expect(hiddenCalendarsValue(new Set(["home", "work"]), groups)).toEqual({
      calendar: { operator: "is not", values: ["home", "work"] },
    });
  });

  test("calendars that are no longer listed do not show in the pill", () => {
    expect(hiddenCalendarsValue(new Set(["removed"]), groups)).toEqual({});
  });
});
