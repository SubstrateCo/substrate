import {
  calendarEventKinds,
  maxMeetingPeople,
  meetingSkipReasons,
  type AttendeeRole,
} from "@substrate/contracts/calendar";

import {
  attendeeRoleLabel,
  calendarActions,
  lastSyncedLabel,
  meetingOutcomeSummary,
  meetingSkipReasonLabels,
  sortAttendees,
  syncStatusLabels,
} from "./labels";
import { expect, test } from "bun:test";

test("every skip reason reads as a distinct human reason", () => {
  const labels = meetingSkipReasons.map((reason) => meetingSkipReasonLabels[reason]);
  expect(new Set(labels).size).toBe(meetingSkipReasons.length);
  expect(meetingSkipReasonLabels.too_many_people).toBe(`More than ${maxMeetingPeople} people`);
  expect(meetingOutcomeSummary({ state: "skipped", reason: "private" }, "default")).toEqual({
    title: "Skipped",
    description: "Private event",
  });
});

test("a skipped non-meeting names the kind of event", () => {
  const skipped = { state: "skipped", reason: "not_a_meeting" } as const;
  const descriptions = Object.fromEntries(
    calendarEventKinds
      .filter((kind) => kind !== "default")
      .map((kind) => [kind, meetingOutcomeSummary(skipped, kind).description]),
  );
  expect(descriptions).toEqual({
    focus_time: "Focus time",
    out_of_office: "Out of office",
    working_location: "Working location",
    birthday: "Birthday",
    from_gmail: "Added by Gmail from a confirmation email",
    other: "Not a meeting",
  });
});

test("sync statuses read as the states the user acts on", () => {
  expect(syncStatusLabels.pending.label).toBe("Syncing");
  expect(syncStatusLabels.active.label).toBe("Up to date");
  expect(syncStatusLabels.reauth_required).toEqual({ label: "Reconnect needed", tone: "warning" });
  expect(syncStatusLabels.error.tone).toBe("destructive");
});

test("guests list the organizer first and declined guests last", () => {
  const guest = (displayName: string, role: AttendeeRole, isOrganizer = false) => ({
    displayName,
    email: `${displayName.toLowerCase()}@example.test`,
    role,
    isOrganizer,
  });
  const sorted = sortAttendees([
    guest("Declined", "declined"),
    guest("Room", "resource"),
    guest("Member", "member"),
    guest("Outside", "new_contact"),
    guest("You", "self"),
    guest("Organizer", "member", true),
  ]);
  expect(sorted.map((attendee) => attendee.displayName)).toEqual([
    "Organizer",
    "You",
    "Outside",
    "Member",
    "Room",
    "Declined",
  ]);
});

test("guests in one group sort by name with numbers in natural order", () => {
  const sorted = sortAttendees(
    ["Guest 11", "guest 2", "Guest 1"].map((displayName) => ({
      displayName,
      email: "guest@example.test",
      role: "new_contact" as const,
      isOrganizer: false,
    })),
  );
  expect(sorted.map((attendee) => attendee.displayName)).toEqual([
    "Guest 1",
    "guest 2",
    "Guest 11",
  ]);
});

test("last synced reads as elapsed time, then as a date", () => {
  const now = new Date(2026, 10, 22, 12, 0);
  const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();
  expect(lastSyncedLabel(null, now)).toBe("Not synced yet");
  expect(lastSyncedLabel(ago(0), now)).toBe("Last synced just now");
  expect(lastSyncedLabel(ago(5), now)).toBe("Last synced 5m ago");
  expect(lastSyncedLabel(ago(60 * 3), now)).toBe("Last synced 3h ago");
  expect(lastSyncedLabel(new Date(2026, 10, 2).toISOString(), now)).toBe("Last synced Nov 2");
});

test("a paused calendar resumes, and a disconnected one only reconnects while its account is linked", () => {
  expect(calendarActions({ syncStatus: "paused", credentialAccountId: "a" })).toMatchObject({
    pause: false,
    resume: true,
    disconnect: true,
  });
  expect(calendarActions({ syncStatus: "active", credentialAccountId: "a" })).toMatchObject({
    pause: true,
    resume: false,
    reconnect: false,
  });
  expect(calendarActions({ syncStatus: "disconnected", credentialAccountId: "a" })).toEqual({
    pause: false,
    resume: false,
    backfill: false,
    disconnect: false,
    reconnect: true,
  });
  expect(calendarActions({ syncStatus: "disconnected", credentialAccountId: null }).reconnect).toBe(
    false,
  );
});

test("a skipped meeting does not promise to add its outside guests as contacts", () => {
  expect(attendeeRoleLabel("new_contact", "upcoming")).toBe("Will be added as contact");
  expect(attendeeRoleLabel("new_contact", "pending")).toBe("Will be added as contact");
  expect(attendeeRoleLabel("new_contact", "skipped")).toBe("Not a contact");
  expect(attendeeRoleLabel("contact", "skipped")).toBe("Contact");
});
