import { parseTaskDate } from "./task-date";
import { describe, expect, it } from "bun:test";

describe("task date shortcuts", () => {
  const today = new Date(2026, 10, 10);
  it("uses local calendar days for shortcuts", () => {
    expect(parseTaskDate("tomorrow", today)).toBe("2026-11-11");
    expect(parseTaskDate("fri", today)).toBe("2026-11-13");
    expect(parseTaskDate("nov 20", today)).toBe("2026-11-20");
    expect(parseTaskDate("jan 1", today)).toBe("2027-01-01");
  });
  it("rejects invalid dates rather than rolling them over", () => {
    expect(parseTaskDate("feb 30", today)).toBeUndefined();
    expect(parseTaskDate("2026-02-30", today)).toBeUndefined();
    expect(parseTaskDate("nonsense", today)).toBeUndefined();
  });
});
