import { dueOccurrence } from "./schedule.ts";
import { expect, test } from "bun:test";

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
