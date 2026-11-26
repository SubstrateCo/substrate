import { dayLabel, fileSize } from "./format";
import { describe, expect, test } from "bun:test";

describe("messaging format", () => {
  test("names today and yesterday by day, not by elapsed hours", () => {
    const now = new Date(2026, 10, 25, 0, 30);
    expect(dayLabel(new Date(2026, 10, 25, 0, 1), now)).toBe("Today");
    expect(dayLabel(new Date(2026, 10, 24, 23, 59), now)).toBe("Yesterday");
  });

  test("file sizes use the largest readable unit", () => {
    expect(fileSize(900)).toBe("900 B");
    expect(fileSize(2048)).toBe("2 KB");
    expect(fileSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});
