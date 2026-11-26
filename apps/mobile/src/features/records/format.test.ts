import { localInstant, validDate } from "./format";
import { expect, test } from "bun:test";

test("a local date and time become that wall-clock instant", () => {
  const instant = localInstant("2026-11-25", "14:30");
  expect(
    instant && [
      instant.getFullYear(),
      instant.getMonth(),
      instant.getDate(),
      instant.getHours(),
      instant.getMinutes(),
    ],
  ).toEqual([2026, 10, 25, 14, 30]);
});

test("impossible dates and times are rejected instead of rolled over", () => {
  expect(validDate("2026-02-30")).toBe(false);
  expect(localInstant("2026-02-30", "10:00")).toBeNull();
  expect(localInstant("2026-11-25", "24:00")).toBeNull();
  expect(localInstant("2026-11-25", "9:5")).toBeNull();
});
