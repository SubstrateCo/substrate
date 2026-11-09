import { shortActivityTime } from "./activity-time";
import { expect, test } from "bun:test";

const now = new Date(2026, 10, 8, 12, 0).getTime();
const ago = (ms: number) => new Date(now - ms).toISOString();

test("recent events use compact relative units", () => {
  expect(shortActivityTime(ago(30_000), now)).toBe("now");
  expect(shortActivityTime(ago(5 * 60_000), now)).toBe("5m");
  expect(shortActivityTime(ago(3 * 3_600_000), now)).toBe("3h");
  expect(shortActivityTime(ago(6 * 86_400_000), now)).toBe("6d");
});

test("events a week or older show a date, with the year only outside the current year", () => {
  expect(shortActivityTime(new Date(2026, 9, 3, 9).toISOString(), now)).toBe("Oct 3");
  expect(shortActivityTime(new Date(2025, 9, 3, 9).toISOString(), now)).toBe("Oct 3, 2025");
});
