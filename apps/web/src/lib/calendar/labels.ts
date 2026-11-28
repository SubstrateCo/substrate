import {
  maxMeetingPeople,
  type AttendeeRole,
  type CalendarAttendeeView,
  type CalendarEventKind,
  type CalendarProvider,
  type CalendarSyncStatus,
  type CalendarView,
  type MeetingOutcome,
  type MeetingSkipReason,
} from "@substrate/contracts/calendar";

import { formatRelativeTime, type DateInput } from "@/lib/format/date";

export const providerLabels: Record<CalendarProvider, string> = {
  google: "Google",
  microsoft: "Microsoft",
};

export type StatusTone = "neutral" | "working" | "success" | "warning" | "destructive";

export const syncStatusLabels: Record<CalendarSyncStatus, { label: string; tone: StatusTone }> = {
  pending: { label: "Syncing", tone: "working" },
  active: { label: "Up to date", tone: "success" },
  error: { label: "Error", tone: "destructive" },
  reauth_required: { label: "Reconnect needed", tone: "warning" },
  paused: { label: "Paused", tone: "neutral" },
  disconnected: { label: "Disconnected", tone: "neutral" },
};

export const meetingSkipReasonLabels: Record<MeetingSkipReason, string> = {
  interactions_off: "Interactions are off for this calendar",
  before_interactions_from: "Before interactions started — backfill to include it",
  not_a_meeting: "Not a meeting",
  cancelled: "Cancelled",
  all_day: "All-day event",
  private: "Private event",
  owner_declined: "You declined",
  no_other_people: "No other people",
  too_many_people: `More than ${maxMeetingPeople} people`,
  no_external_attendees: "No outside attendees",
};

const nonMeetingKindLabels: Record<Exclude<CalendarEventKind, "default">, string> = {
  from_gmail: "Added by Gmail from a confirmation email",
  focus_time: "Focus time",
  out_of_office: "Out of office",
  working_location: "Working location",
  birthday: "Birthday",
  other: "Not a meeting",
};

function skipReasonLabel(reason: MeetingSkipReason, kind: CalendarEventKind) {
  if (reason === "not_a_meeting" && kind !== "default") return nonMeetingKindLabels[kind];
  return meetingSkipReasonLabels[reason];
}

const attendeeRoleLabels: Record<AttendeeRole, string> = {
  self: "You",
  contact: "Contact",
  new_contact: "Will be added as contact",
  member: "Org member",
  resource: "Room",
  declined: "Declined",
};

export function attendeeRoleLabel(role: AttendeeRole, outcome: MeetingOutcome["state"]) {
  if (role === "new_contact" && outcome === "skipped") return "Not a contact";
  return attendeeRoleLabels[role];
}

const roleOrder: Record<AttendeeRole, number> = {
  self: 1,
  contact: 2,
  new_contact: 2,
  member: 3,
  resource: 4,
  declined: 5,
};

const guestNames = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function sortAttendees<
  T extends Pick<CalendarAttendeeView, "role" | "isOrganizer" | "displayName" | "email">,
>(attendees: readonly T[]) {
  return [...attendees].sort(
    (a, b) =>
      Number(b.isOrganizer) - Number(a.isOrganizer) ||
      roleOrder[a.role] - roleOrder[b.role] ||
      guestNames.compare(a.displayName ?? a.email, b.displayName ?? b.email),
  );
}

export function meetingOutcomeSummary(outcome: MeetingOutcome, kind: CalendarEventKind) {
  switch (outcome.state) {
    case "upcoming":
      return {
        title: "Upcoming",
        description: "Interactions are recorded for outside attendees after the meeting ends.",
      };
    case "pending":
      return {
        title: "Interactions pending",
        description: "This meeting has ended. Interactions are recorded on the next sync.",
      };
    case "recorded":
      return {
        title: "Recorded",
        description: "Each outside attendee has an interaction for this meeting.",
      };
    case "skipped":
      return { title: "Skipped", description: skipReasonLabel(outcome.reason, kind) };
  }
}

export function lastSyncedLabel(lastSyncedAt: string | null, now: DateInput = Date.now()) {
  if (!lastSyncedAt) return "Not synced yet";
  const relative = formatRelativeTime(lastSyncedAt, now);
  if (!relative) return "Not synced yet";
  if (relative === "now") return "Last synced just now";
  return /^\d+[mhd]$/.test(relative) ? `Last synced ${relative} ago` : `Last synced ${relative}`;
}

export function calendarActions(
  calendar: Pick<CalendarView, "syncStatus" | "credentialAccountId">,
) {
  const disconnected = calendar.syncStatus === "disconnected";
  return {
    pause: !disconnected && calendar.syncStatus !== "paused",
    resume: calendar.syncStatus === "paused",
    backfill: !disconnected,
    disconnect: !disconnected,
    reconnect: disconnected && calendar.credentialAccountId !== null,
  };
}
