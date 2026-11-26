import { activityTime } from "./activity-time";
import { expect, test } from "bun:test";

test("today's activity shows a compact clock without seconds or a repeated date", () => {
  const now = new Date(2026, 10, 26, 12);
  const time = activityTime(new Date(2026, 10, 26, 9, 15, 1).toISOString(), now);
  expect(time?.label).toBe("9:15 AM");
});

test("older activity includes its date and time, even just across midnight", () => {
  const now = new Date(2026, 10, 27, 0, 1);
  const time = activityTime(new Date(2026, 10, 26, 23, 59, 2).toISOString(), now);
  expect(time?.label).toBe("Nov 26, 11:59 PM");
});

test("activity from a previous year keeps the year in its visible date", () => {
  const now = new Date(2026, 10, 26, 12);
  const time = activityTime(new Date(2025, 10, 26, 9, 15).toISOString(), now);
  expect(time?.label).toBe("Nov 26, 2025, 9:15 AM");
});

test("the accessible timestamp retains the exact instant and year even for sub-second ties", () => {
  const value = "2026-11-26T09:15:01.123Z";
  const time = activityTime(value);
  expect(time?.iso).toBe(value);
  expect(time?.full).toContain("2026");
  expect(time?.full).toContain(value);
  const next = activityTime("2026-11-26T09:15:01.124Z");
  expect(next?.full).not.toBe(time?.full);
});

test("invalid activity timestamps are not presented as dates", () => {
  expect(activityTime("invalid")).toBeUndefined();
});
