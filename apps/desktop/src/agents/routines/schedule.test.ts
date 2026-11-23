import { dueOccurrence, nextOccurrence } from "./schedule.ts";
import { expect, test } from "bun:test";

test("4 PM Eastern stays at 4 PM across both daylight saving transitions", () => {
  for (const [after, expected] of [
    ["2026-03-07T21:00:00Z", "2026-03-08T20:00:00.000Z"],
    ["2026-10-31T20:00:00Z", "2026-11-01T21:00:00.000Z"],
  ]) {
    const next = nextOccurrence("0 16 * * *", "America/New_York", Date.parse(after!));
    expect(new Date(next!).toISOString()).toBe(expected);
  }
});

test("catch-up uses the schedule's zone and preserves its next local run", () => {
  const result = dueOccurrence(
    "0 16 * * *",
    "America/New_York",
    Date.parse("2026-03-07T21:00:00Z"),
    Date.parse("2026-03-09T22:00:00Z"),
  );
  expect(new Date(result.occurrence).toISOString()).toBe("2026-03-09T20:00:00.000Z");
  expect(new Date(result.nextFireAt!).toISOString()).toBe("2026-03-10T20:00:00.000Z");
});

test("missed ticks collapse into the latest due occurrence", () => {
  const due = Date.parse("2026-06-01T09:00:00Z");
  const now = Date.parse("2026-06-03T12:00:00Z");
  const result = dueOccurrence("0 9 * * *", "UTC", due, now);
  expect(new Date(result.occurrence).toISOString()).toBe("2026-06-03T09:00:00.000Z");
  expect(new Date(result.nextFireAt!).toISOString()).toBe("2026-06-04T09:00:00.000Z");
});

test("a frequent routine missed for a year collapses into its latest occurrence at once", () => {
  const due = Date.parse("2025-06-01T09:00:00Z");
  const now = Date.parse("2026-06-03T12:00:30Z");
  const result = dueOccurrence("* * * * *", "UTC", due, now);
  expect(new Date(result.occurrence).toISOString()).toBe("2026-06-03T12:00:00.000Z");
  expect(new Date(result.nextFireAt!).toISOString()).toBe("2026-06-03T12:01:00.000Z");
}, 1000);

test("a due occurrence with no later tick stays the occurrence", () => {
  const due = Date.parse("2026-06-03T09:00:00Z");
  const result = dueOccurrence("0 9 * * *", "UTC", due, due);
  expect(new Date(result.occurrence).toISOString()).toBe("2026-06-03T09:00:00.000Z");
  expect(new Date(result.nextFireAt!).toISOString()).toBe("2026-06-04T09:00:00.000Z");
});
