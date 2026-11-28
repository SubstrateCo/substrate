import {
  describeSchedule,
  formatClock,
  parseSchedule,
  scheduleCron,
  timeOptions,
} from "./schedule";
import { describe, expect, test } from "bun:test";

describe("routine schedules", () => {
  test("builder schedules round-trip through cron", () => {
    for (const cron of ["0 9 * * *", "30 17 * * 1-5", "5 8 * * 1", "0 0 * * 0"])
      expect(scheduleCron(parseSchedule(cron))).toBe(cron);
  });

  test("reads Sunday written as 7 as Sunday", () => {
    expect(parseSchedule("0 9 * * 7")).toMatchObject({ frequency: "weekly", cronWeekday: 0 });
  });

  test("keeps schedules the builder can't show as custom cron", () => {
    for (const cron of ["*/15 * * * *", "0 9 1 * *", "0 9 * * 1,3", "0 9-17 * * *", "bad"]) {
      const schedule = parseSchedule(cron);
      expect(schedule.frequency).toBe("custom");
      expect(scheduleCron(schedule)).toBe(cron);
    }
  });

  test("describes schedules in words", () => {
    expect(describeSchedule("0 9 * * 1-5")).toBe("Every weekday at 9:00 AM");
    expect(describeSchedule("30 17 * * *")).toBe("Every day at 5:30 PM");
    expect(describeSchedule("0 0 * * 1")).toBe("Every Monday at 12:00 AM");
    expect(describeSchedule("*/15 * * * *")).toBe("Custom schedule (*/15 * * * *)");
  });

  test("formats noon and midnight", () => {
    expect(formatClock("12:00")).toBe("12:00 PM");
    expect(formatClock("00:05")).toBe("12:05 AM");
  });

  test("offers every quarter hour and keeps a saved time that is off the grid", () => {
    const grid = timeOptions("09:00");
    expect(grid).toHaveLength(96);
    expect(grid[0]).toEqual({ value: "00:00", label: "12:00 AM" });
    expect(grid.at(-1)).toEqual({ value: "23:45", label: "11:45 PM" });
    const offGrid = timeOptions("08:05");
    expect(offGrid).toHaveLength(97);
    expect(offGrid.map((option) => option.value).indexOf("08:05")).toBe(
      offGrid.map((option) => option.value).indexOf("08:00") + 1,
    );
  });
});
