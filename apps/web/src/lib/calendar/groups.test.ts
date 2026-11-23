import { groupCalendarsByAccount } from "./groups";
import { calendarAccount, calendarView } from "./test-support";
import { expect, test } from "bun:test";

const names = (groups: ReturnType<typeof groupCalendarsByAccount>) =>
  groups.map((group) => [group.label, group.calendars.map((calendar) => calendar.name)]);

test("calendars group under their account, primary first, then by name", () => {
  const groups = groupCalendarsByAccount({
    accounts: [
      calendarAccount({
        credentialAccountId: "work",
        email: "alice@northstar.test",
        calendars: [
          calendarView({ name: "team 10" }),
          calendarView({ name: "Team 2" }),
          calendarView({ name: "Alice Park", isPrimary: true }),
        ],
      }),
      calendarAccount({
        credentialAccountId: "personal",
        email: "alice@example.test",
        calendars: [calendarView({ name: "Alice", isPrimary: true })],
      }),
    ],
    detachedCalendars: [],
  });
  expect(names(groups)).toEqual([
    ["alice@northstar.test", ["Alice Park", "Team 2", "team 10"]],
    ["alice@example.test", ["Alice"]],
  ]);
  expect(groups.map((group) => group.provider)).toEqual(["google", "google"]);
});

test("calendars whose account was removed come last, and empty accounts are left out", () => {
  const groups = groupCalendarsByAccount({
    accounts: [
      calendarAccount({ credentialAccountId: "empty", email: "empty@example.test" }),
      calendarAccount({
        credentialAccountId: "work",
        email: "alice@northstar.test",
        calendars: [calendarView({ name: "Work" })],
      }),
    ],
    detachedCalendars: [
      calendarView({ name: "Old", credentialAccountId: null, syncStatus: "disconnected" }),
      calendarView({ name: "Archive", credentialAccountId: null, syncStatus: "disconnected" }),
    ],
  });
  expect(names(groups)).toEqual([
    ["alice@northstar.test", ["Work"]],
    ["Disconnected accounts", ["Archive", "Old"]],
  ]);
  expect(groups.at(-1)?.provider).toBeNull();
});

test("an account without an email is named for its provider", () => {
  const [group] = groupCalendarsByAccount({
    accounts: [
      calendarAccount({
        credentialAccountId: "work",
        email: null,
        calendars: [calendarView({ name: "Work" })],
      }),
    ],
    detachedCalendars: [],
  });
  expect(group.label).toBe("Google account");
});
