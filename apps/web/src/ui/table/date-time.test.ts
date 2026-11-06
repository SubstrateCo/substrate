import { expect, test } from "bun:test";
import { dateTimeValue } from "./date-time";

test("date-time columns normalize supported values to timestamps", () => {
  const timestamp = Date.UTC(2026, 10, 12, 10, 30);
  expect(dateTimeValue(new Date(timestamp))).toBe(timestamp);
  expect(dateTimeValue("2026-11-12T10:30:00Z")).toBe(timestamp);
  expect(dateTimeValue(timestamp)).toBe(timestamp);
  expect(dateTimeValue(0)).toBe(0);
});

test("empty and invalid dates use the missing-value display and sorting path", () => {
  for (const value of [null, undefined, "", "invalid", new Date(NaN), NaN, Infinity, 1e20]) {
    expect(dateTimeValue(value)).toBeUndefined();
  }
});
