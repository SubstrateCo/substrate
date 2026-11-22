import { interactionDay, interactionWindow } from "./interaction-period";
import { describe, expect, test } from "bun:test";

describe("interaction calendar periods", () => {
  test("the 30-day window ends with today and includes empty calendar days", () => {
    const { period, dates } = interactionWindow("workspace", 30, new Date(2026, 0, 10, 12));
    expect(dates).toHaveLength(30);
    expect(dates[0]).toBe("2025-12-12");
    expect(dates.at(-1)).toBe("2026-01-10");
    expect(new Date(period.until)).toEqual(new Date(2026, 0, 11));
  });

  for (const day of ["2026-03-08", "2026-11-01", "2026-12-31"]) {
    test(`the selected day uses local midnights across calendar and daylight-saving boundaries: ${day}`, () => {
      const { period } = interactionWindow("workspace", 30);
      const selected = interactionDay(period, day);
      const [year, month, date] = day.split("-").map(Number);
      expect(selected).toEqual({
        ...period,
        from: new Date(year!, month! - 1, date!).toISOString(),
        until: new Date(year!, month! - 1, date! + 1).toISOString(),
      });
    });
  }
});
