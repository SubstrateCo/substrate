import { dueOccurrence, nextOccurrence } from "./schedule";
import { expect, test } from "bun:test";

const at = (value: string) => new Date(value);

test("4 PM Eastern stays at 4 PM across both daylight saving transitions", () => {
  for (const [after, expected] of [
    ["2026-03-07T21:00:00Z", "2026-03-08T20:00:00.000Z"],
    ["2026-10-31T20:00:00Z", "2026-11-01T21:00:00.000Z"],
  ])
    expect(nextOccurrence("0 16 * * *", "America/New_York", at(after!))?.toISOString()).toBe(
      expected,
    );
});

test("catch-up uses the schedule's zone and preserves its next local run", () => {
  const result = dueOccurrence(
    "0 16 * * *",
    "America/New_York",
    at("2026-03-07T21:00:00Z"),
    at("2026-03-09T22:00:00Z"),
  );
  expect(result.occurrence.toISOString()).toBe("2026-03-09T20:00:00.000Z");
  expect(result.nextFireAt?.toISOString()).toBe("2026-03-10T20:00:00.000Z");
});

test("missed ticks collapse into the latest due occurrence", () => {
  const result = dueOccurrence(
    "0 9 * * *",
    "UTC",
    at("2026-06-01T09:00:00Z"),
    at("2026-06-03T12:00:00Z"),
  );
  expect(result.occurrence.toISOString()).toBe("2026-06-03T09:00:00.000Z");
  expect(result.nextFireAt?.toISOString()).toBe("2026-06-04T09:00:00.000Z");
});

test("a frequent routine missed for a year collapses into its latest occurrence at once", () => {
  const result = dueOccurrence(
    "* * * * *",
    "UTC",
    at("2025-06-01T09:00:00Z"),
    at("2026-06-03T12:00:30Z"),
  );
  expect(result.occurrence.toISOString()).toBe("2026-06-03T12:00:00.000Z");
  expect(result.nextFireAt?.toISOString()).toBe("2026-06-03T12:01:00.000Z");
}, 1000);

test("a due occurrence with no later tick stays the occurrence", () => {
  const due = at("2026-06-03T09:00:00Z");
  const result = dueOccurrence("0 9 * * *", "UTC", due, due);
  expect(result.occurrence.toISOString()).toBe("2026-06-03T09:00:00.000Z");
  expect(result.nextFireAt?.toISOString()).toBe("2026-06-04T09:00:00.000Z");
});
