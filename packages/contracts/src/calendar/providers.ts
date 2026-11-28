export const calendarProviders = ["google", "microsoft"] as const;
export type CalendarProvider = (typeof calendarProviders)[number];
export const implementedCalendarProviders = [
  "google",
] as const satisfies readonly CalendarProvider[];

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

/** A calendar in the provider account, as offered for connection. */
export interface ProviderCalendar {
  providerCalendarId: string;
  name: string;
  color: string | null;
  timeZone: string | null;
  isPrimary: boolean;
}
