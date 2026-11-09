import { dueOccurrence, nextOccurrence } from "./schedule.ts";
import { expect, test } from "bun:test";

test("a daily routine keeps its local time across a daylight saving change", () => {
  // Europe/Berlin moves from UTC+1 to UTC+2 on 2026-03-29.
  const before = Date.parse("2026-03-28T07:30:00Z");
  const first = nextOccurrence("0 9 * * *", "Europe/Berlin", before)!;
  expect(new Date(first).toISOString()).toBe("2026-03-28T08:00:00.000Z");
  const second = nextOccurrence("0 9 * * *", "Europe/Berlin", first)!;
  expect(new Date(second).toISOString()).toBe("2026-03-29T07:00:00.000Z");
});

test("missed ticks collapse into the latest due occurrence", () => {
  const due = Date.parse("2026-06-01T09:00:00Z");
  const now = Date.parse("2026-06-03T12:00:00Z");
  const result = dueOccurrence("0 9 * * *", "UTC", due, now);
  expect(new Date(result.occurrence).toISOString()).toBe("2026-06-03T09:00:00.000Z");
  expect(new Date(result.nextFireAt!).toISOString()).toBe("2026-06-04T09:00:00.000Z");
});
