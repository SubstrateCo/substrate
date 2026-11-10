import { describeSchedule, formatClock, parseSchedule, scheduleCron } from "./schedule";
import { describe, expect, test } from "bun:test";

describe("routine schedules", () => {
  test("builder schedules round-trip through cron", () => {
    for (const cron of ["0 9 * * *", "30 17 * * 1-5", "5 8 * * 1", "0 0 * * 0"])
      expect(scheduleCron(parseSchedule(cron))).toBe(cron);
  });

  test("reads Sunday written as 7 as Sunday", () => {
    expect(parseSchedule("0 9 * * 7")).toMatchObject({ frequency: "weekly", weekday: 0 });
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
});
