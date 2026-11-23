import { meetingTiming } from "./meeting-labels";
import { describe, expect, test } from "bun:test";

// Local times, so the range reads the same in every time zone.
const at = (hours: number, minutes: number, seconds = 0) =>
  new Date(2026, 10, 22, hours, minutes, seconds);

const meeting = (phase: "upcoming" | "started" = "upcoming") => ({
  title: "Design review",
  startsAt: at(10, 0).toISOString(),
  endsAt: at(10, 30).toISOString(),
  calendarName: "Work",
  color: null,
  phase,
  joinable: true,
});

describe("meetingTiming", () => {
  test("counts down in whole minutes, rounding up", () => {
    expect(meetingTiming(meeting(), at(9, 59, 1)).relative).toBe("In 1 min");
    expect(meetingTiming(meeting(), at(9, 55, 30)).relative).toBe("In 5 min");
    expect(meetingTiming(meeting(), at(8, 45)).relative).toBe("In 1 hr 15 min");
    expect(meetingTiming(meeting(), at(9, 0)).relative).toBe("In 1 hr");
  });

  test("says the meeting is starting in its last 30 seconds", () => {
    const timing = meetingTiming(meeting(), at(9, 59, 45));
    expect(timing.relative).toBe("Starting now");
    expect(timing.phase).toBe("upcoming");
  });

  test("counts up after the start, rounding down", () => {
    expect(meetingTiming(meeting("started"), at(10, 0, 40)).relative).toBe("Started just now");
    expect(meetingTiming(meeting("started"), at(10, 2, 59)).relative).toBe("Started 2 min ago");
  });

  test("treats a passed start as started before main updates the phase", () => {
    expect(meetingTiming(meeting("upcoming"), at(10, 1)).phase).toBe("started");
  });

  test("says the meeting ended once its end time passes", () => {
    expect(meetingTiming(meeting("started"), at(10, 30)).relative).toBe("Ended");
  });

  test("shows the time range", () => {
    expect(meetingTiming(meeting(), at(9, 59)).range).toBe("10:00 AM – 10:30 AM");
  });
});
