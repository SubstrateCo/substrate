import type {
  CalendarProvider,
  ProviderCalendar,
  CalendarEventStatus,
  CalendarEventKind,
  AttendeeResponseStatus,
  CalendarEventVisibility,
} from "./providers.ts";
import type { CalendarSyncStatus } from "./sync.ts";

/** Why a meeting did not create interactions. */
export const meetingSkipReasons = [
  "interactions_off",
  "before_interactions_from",
  "not_a_meeting",
  "cancelled",
  "all_day",
  "private",
  "owner_declined",
  "no_other_people",
  "too_many_people",
  "no_external_attendees",
] as const;
export type MeetingSkipReason = (typeof meetingSkipReasons)[number];

export type MeetingOutcome =
  | { state: "upcoming" }
  | { state: "pending" }
  | { state: "recorded" }
  | { state: "skipped"; reason: MeetingSkipReason };

// Response views. Times are ISO 8601 strings.

export interface CalendarView {
  entityId: string;
  provider: CalendarProvider;
  credentialAccountId: string | null;
  providerCalendarId: string;
  name: string;
  color: string | null;
  timeZone: string | null;
  isPrimary: boolean;
  recordsInteractions: boolean;
  syncStatus: CalendarSyncStatus;
  syncErrorCode: string | null;
  lastSyncedAt: string | null;
  interactionsFrom: string;
  syncWindowStart: string;
}

/** A linked provider account and the calendars connected from it in this organization. */
export interface CalendarAccountView {
  credentialAccountId: string;
  provider: CalendarProvider;
  /** The account email, when known. */
  email: string | null;
  /** False when the account was linked without the calendar scope. */
  hasCalendarAccess: boolean;
  calendars: CalendarView[];
}

export interface CalendarSettingsView {
  /** Providers this server can connect. */
  providers: CalendarProvider[];
  accounts: CalendarAccountView[];
  /** Calendars whose provider account was unlinked. They keep their history. */
  detachedCalendars: CalendarView[];
}

export interface ProviderCalendarOption extends ProviderCalendar {
  /** The connected calendar in this organization, if any. */
  connectedEntityId: string | null;
}

export interface CalendarEventSummary {
  entityId: string;
  calendarEntityId: string;
  calendarName: string;
  color: string | null;
  title: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  status: CalendarEventStatus;
  kind: CalendarEventKind;
  location: string | null;
  conferenceUrl: string | null;
  /** People, not counting rooms or resources. */
  attendeeCount: number;
  /** The owner's response, or null when the owner is not listed as an attendee. */
  selfResponseStatus: AttendeeResponseStatus | null;
}

export type AttendeeRole = "self" | "contact" | "new_contact" | "member" | "resource" | "declined";

export interface CalendarAttendeeView {
  email: string;
  displayName: string | null;
  responseStatus: AttendeeResponseStatus;
  isOrganizer: boolean;
  isOptional: boolean;
  role: AttendeeRole;
  /** The contact matched by email, if the viewer can read one. */
  contact: { entityId: string; displayName: string } | null;
}

export interface CalendarEventDetail extends CalendarEventSummary {
  description: string | null;
  htmlLink: string | null;
  visibility: CalendarEventVisibility;
  timeZone: string | null;
  provider: CalendarProvider;
  attendees: CalendarAttendeeView[];
  outcome: MeetingOutcome;
  interactions: { entityId: string; contactEntityId: string; contactName: string }[];
}

/** The meeting an interaction came from, shown only to readers of the event. */
export interface InteractionSourceEvent {
  entityId: string;
  title: string;
  startsAt: string;
}
