import { qualifyMeeting, type QualificationInput } from "./qualification";
import { expect, test } from "bun:test";

const now = new Date("2026-11-20T16:00:00Z");
function input(
  overrides: Partial<QualificationInput["event"]> = {},
  people = 3,
): QualificationInput {
  return {
    calendar: { recordsInteractions: true, interactionsFrom: new Date("2026-11-01T00:00:00Z") },
    event: {
      kind: "default",
      status: "confirmed",
      allDay: false,
      visibility: "default",
      endsAt: new Date("2026-11-20T15:45:00Z"),
      ...overrides,
    },
    attendees: Array.from({ length: people }, (_, index) => ({
      responseStatus: "accepted",
      isSelf: index === 0,
      isResource: false,
    })),
    now,
  };
}

test("an ended meeting of a few people is eligible", () => {
  expect(qualifyMeeting(input())).toEqual({ state: "eligible" });
});

test("a meeting that has not ended is upcoming", () => {
  expect(qualifyMeeting(input({ endsAt: new Date("2026-11-20T17:00:00Z") }))).toEqual({
    state: "upcoming",
  });
});

test.each([
  ["cancelled", { status: "cancelled" }],
  ["not_a_meeting", { kind: "focus_time" }],
  ["all_day", { allDay: true }],
  ["private", { visibility: "private" }],
  ["private", { visibility: "confidential" }],
] as const)("events are skipped as %s", (reason, overrides) => {
  expect(qualifyMeeting(input(overrides))).toEqual({ state: "skipped", reason });
});

test("the people limit counts the owner and is inclusive at 15", () => {
  expect(qualifyMeeting(input({}, 15)).state).toBe("eligible");
  expect(qualifyMeeting(input({}, 16))).toEqual({ state: "skipped", reason: "too_many_people" });
});

test("rooms do not count as people, and an unlisted owner does", () => {
  const value = input({}, 15);
  value.attendees.push({ responseStatus: "accepted", isSelf: false, isResource: true });
  expect(qualifyMeeting(value).state).toBe("eligible");
  const solo = input({}, 0);
  expect(qualifyMeeting(solo)).toEqual({ state: "skipped", reason: "no_other_people" });
  solo.attendees.push({ responseStatus: "accepted", isSelf: false, isResource: false });
  expect(qualifyMeeting(solo).state).toBe("eligible");
});

test("an owner who declined did not meet", () => {
  const value = input();
  value.attendees[0]!.responseStatus = "declined";
  expect(qualifyMeeting(value)).toEqual({ state: "skipped", reason: "owner_declined" });
});

test("calendar consent and the interaction start gate eligible meetings", () => {
  const off = input();
  off.calendar.recordsInteractions = false;
  expect(qualifyMeeting(off)).toEqual({ state: "skipped", reason: "interactions_off" });
  const early = input({ endsAt: new Date("2026-10-31T12:00:00Z") });
  expect(qualifyMeeting(early)).toEqual({ state: "skipped", reason: "before_interactions_from" });
});
