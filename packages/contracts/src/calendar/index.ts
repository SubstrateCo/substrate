import { googleProductScopes } from "../integrations/google.ts";

// Calendar sync is read-only. Microsoft values are part of the model so the schema and contracts
// need no change when Outlook support lands, but only Google is implemented.
export const calendarProviders = ["google", "microsoft"] as const;
export type CalendarProvider = (typeof calendarProviders)[number];
export const implementedCalendarProviders = [
  "google",
] as const satisfies readonly CalendarProvider[];

export const calendarSyncStatuses = [
  "pending",
  "active",
  "error",
  "reauth_required",
  "paused",
  "disconnected",
] as const;
export type CalendarSyncStatus = (typeof calendarSyncStatuses)[number];

// Only `default` events are meetings. The others never create contacts or interactions.
export const calendarEventKinds = [
  "default",
  "focus_time",
  "out_of_office",
  "working_location",
  "birthday",
  "from_gmail",
  "other",
] as const;
export type CalendarEventKind = (typeof calendarEventKinds)[number];

export const calendarEventStatuses = ["confirmed", "tentative", "cancelled"] as const;
export type CalendarEventStatus = (typeof calendarEventStatuses)[number];

export const calendarEventVisibilities = ["default", "public", "private", "confidential"] as const;
export type CalendarEventVisibility = (typeof calendarEventVisibilities)[number];

export const attendeeResponseStatuses = [
  "needs_action",
  "accepted",
  "declined",
  "tentative",
] as const;
export type AttendeeResponseStatus = (typeof attendeeResponseStatuses)[number];

/** A meeting with more people than this, counting the owner and not rooms, is skipped. */
export const maxMeetingPeople = 15;
/** The first sync fetches this many days of past events, for display only. */
export const initialSyncPastDays = 30;
/** A backfill moves the sync window and the interaction start back this far. */
export const backfillPastDays = 365;
/** A full sync fetches events up to this many days ahead. */
export const syncFutureDays = 180;
/**
 * Google adds events from Gmail confirmation emails without checking for a matching invite, so a
 * booking tool that sends both an email and an invite, or travel the owner also entered by hand,
 * shows twice. Views hide a `from_gmail` event when the owner has another event starting within
 * this window. Booking emails and invites can round or shift the start, so an exact match misses.
 */
export const gmailDuplicateWindowMs = 15 * 60_000;
/** Polling interval for an active calendar. */
export const calendarSyncIntervalMs = 5 * 60_000;

/** The Google OAuth scope that calendar sync needs. The Google product registry owns it. */
export const googleCalendarScope = googleProductScopes.calendar[0];

/**
 * One event occurrence as a provider adapter returns it. Recurring events are expanded: each
 * occurrence has its own `providerEventId`. All-day events start and end at UTC midnight of their
 * dates, with `allDay` set. Times are ISO 8601 strings.
 */
export interface ProviderCalendarEvent {
  providerEventId: string;
  icalUid: string | null;
  recurringEventId: string | null;
  kind: CalendarEventKind;
  status: CalendarEventStatus;
  /** Empty when the provider has no title. */
  title: string;
  description: string | null;
  location: string | null;
  conferenceUrl: string | null;
  htmlLink: string | null;
  visibility: CalendarEventVisibility;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  timeZone: string | null;
  providerUpdatedAt: string | null;
  attendees: ProviderCalendarAttendee[];
}

export interface ProviderCalendarAttendee {
  email: string;
  displayName: string | null;
  responseStatus: AttendeeResponseStatus;
  isOrganizer: boolean;
  isSelf: boolean;
  isOptional: boolean;
  isResource: boolean;
}

/**
 * One sync run's changes. A full sync lists every event in the window, so events it does not list
 * are gone. An incremental sync names deleted events in `cancelledEventIds`, because providers
 * return only their IDs.
 */
export interface ProviderSyncResult {
  fullSync: boolean;
  events: ProviderCalendarEvent[];
  cancelledEventIds: string[];
  /** The cursor for the next incremental sync. */
  nextCursor: string | null;
}

/** A calendar in the provider account, as offered for connection. */
export interface ProviderCalendar {
  providerCalendarId: string;
  name: string;
  color: string | null;
  timeZone: string | null;
  isPrimary: boolean;
}

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
