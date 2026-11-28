import { shouldAlert, withinSchedule } from "./alerts.ts";
import {
  defaultAccountNotificationPreferences,
  defaultWorkspaceNotificationPreferences,
  notificationSchedule,
} from "./preferences.ts";
import { describe, expect, test } from "bun:test";

// Wednesday 2026-11-25, 12:00 UTC.
const now = new Date("2026-11-25T12:00:00.000Z");
const later = "2026-11-25T13:00:00.000Z";
const earlier = "2026-11-25T11:00:00.000Z";

function alert(input: Partial<Parameters<typeof shouldAlert>[0]> = {}) {
  return shouldAlert({
    kind: "message",
    conversationKind: "group",
    conversation: null,
    workspace: defaultWorkspaceNotificationPreferences,
    account: defaultAccountNotificationPreferences,
    now,
    ...input,
  });
}

describe("conversation levels", () => {
  test("direct and group conversations alert for every message by default", () => {
    expect(alert({ conversationKind: "dm" })).toBe(true);
    expect(alert({ conversationKind: "group" })).toBe(true);
  });

  test("channels follow the workspace channel level", () => {
    expect(alert({ conversationKind: "channel" })).toBe(false);
    expect(alert({ conversationKind: "channel", kind: "mention" })).toBe(true);
    expect(
      alert({
        conversationKind: "channel",
        workspace: { ...defaultWorkspaceNotificationPreferences, channels: "all" },
      }),
    ).toBe(true);
  });

  test("a conversation level overrides the default", () => {
    const conversation = { level: "mentions" as const, mutedUntil: null };
    expect(alert({ conversationKind: "dm", conversation })).toBe(false);
    expect(alert({ conversationKind: "dm", conversation, kind: "reply" })).toBe(true);
    expect(
      alert({
        conversationKind: "dm",
        conversation: { level: "nothing", mutedUntil: null },
        kind: "mention",
      }),
    ).toBe(false);
  });

  test("a conversation mute silences mentions until it ends", () => {
    expect(alert({ kind: "mention", conversation: { level: null, mutedUntil: later } })).toBe(
      false,
    );
    expect(alert({ kind: "mention", conversation: { level: null, mutedUntil: earlier } })).toBe(
      true,
    );
  });
});

describe("workspace and account rules", () => {
  test("a workspace mute silences every kind until it ends", () => {
    const workspace = { ...defaultWorkspaceNotificationPreferences, mutedUntil: later };
    expect(alert({ kind: "mention", workspace })).toBe(false);
    expect(alert({ kind: "assignment", conversationKind: null, workspace })).toBe(false);
  });

  test("assignments follow the workspace toggle", () => {
    expect(alert({ kind: "assignment", conversationKind: null })).toBe(true);
    expect(
      alert({
        kind: "assignment",
        conversationKind: null,
        workspace: { ...defaultWorkspaceNotificationPreferences, assignments: false },
      }),
    ).toBe(false);
  });

  test("disabled alerts and an active pause silence everything", () => {
    const account = defaultAccountNotificationPreferences;
    expect(alert({ kind: "mention", account: { ...account, alertsEnabled: false } })).toBe(false);
    expect(alert({ kind: "mention", account: { ...account, pausedUntil: later } })).toBe(false);
    expect(alert({ kind: "mention", account: { ...account, pausedUntil: earlier } })).toBe(true);
  });

  test("alerts outside the schedule are silenced", () => {
    const account = {
      ...defaultAccountNotificationPreferences,
      schedule: { days: [1, 2, 3, 4, 5], start: 9 * 60, end: 11 * 60, timeZone: "UTC" },
    };
    expect(alert({ kind: "mention", account })).toBe(false);
  });
});

describe("schedules", () => {
  const weekdays = [1, 2, 3, 4, 5];

  test("a daytime window applies in the schedule's time zone", () => {
    const schedule = { days: weekdays, start: 9 * 60, end: 17 * 60, timeZone: "America/New_York" };
    // 12:00 UTC is 07:00 in New York.
    expect(withinSchedule(schedule, now)).toBe(false);
    expect(withinSchedule(schedule, new Date("2026-11-25T15:00:00.000Z"))).toBe(true);
    // Saturday at noon in New York.
    expect(withinSchedule(schedule, new Date("2026-11-28T17:00:00.000Z"))).toBe(false);
  });

  test("an overnight window belongs to the day it starts on", () => {
    const schedule = { days: [5], start: 22 * 60, end: 2 * 60, timeZone: "UTC" };
    // Friday 23:00 and Saturday 01:00 are inside; Friday 01:00 belongs to Thursday.
    expect(withinSchedule(schedule, new Date("2026-11-27T23:00:00.000Z"))).toBe(true);
    expect(withinSchedule(schedule, new Date("2026-11-28T01:00:00.000Z"))).toBe(true);
    expect(withinSchedule(schedule, new Date("2026-11-27T01:00:00.000Z"))).toBe(false);
  });

  test("schedules reject unknown time zones, repeated days and empty windows", () => {
    const valid = { days: [1], start: 60, end: 120, timeZone: "UTC" };
    expect(notificationSchedule.safeParse(valid).success).toBe(true);
    expect(notificationSchedule.safeParse({ ...valid, timeZone: "Mars/Base" }).success).toBe(false);
    expect(notificationSchedule.safeParse({ ...valid, days: [1, 1] }).success).toBe(false);
    expect(notificationSchedule.safeParse({ ...valid, end: 60 }).success).toBe(false);
  });
});
