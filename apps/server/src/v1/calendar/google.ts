import {
  calendarEventStatuses,
  calendarEventVisibilities,
  syncFutureDays,
  type AttendeeResponseStatus,
  type CalendarEventKind,
  type ProviderCalendar,
  type ProviderCalendarAttendee,
  type ProviderCalendarEvent,
  type ProviderSyncResult,
} from "@substrate/contracts/calendar";

import {
  createGoogleClient,
  GoogleError,
  GoogleGone,
  googlePages,
  GoogleReauthRequired,
  GoogleScopeMissing,
  type GoogleClient,
  type GoogleFetch,
} from "../../integrations/google";
import {
  CalendarAccessRequired,
  CalendarCursorExpired,
  CalendarProviderFailure,
  ProviderNotConfigured,
} from "./errors";
import type { CalendarAccountRef, CalendarProviderAdapter } from "./providers";
import { z } from "zod";

const api = "https://www.googleapis.com/calendar/v3";

const kinds = {
  default: "default",
  focusTime: "focus_time",
  outOfOffice: "out_of_office",
  workingLocation: "working_location",
  birthday: "birthday",
  fromGmail: "from_gmail",
  other: "other",
} as const satisfies Record<string, CalendarEventKind>;
const responses = {
  needsAction: "needs_action",
  accepted: "accepted",
  declined: "declined",
  tentative: "tentative",
} as const satisfies Record<string, AttendeeResponseStatus>;
// `other` is not a Google type: the parser uses it for types this adapter does not know.
const googleKinds = [
  "default",
  "focusTime",
  "outOfOffice",
  "workingLocation",
  "birthday",
  "fromGmail",
  "other",
] as const;
const googleResponses = ["needsAction", "accepted", "declined", "tentative"] as const;

const person = z.object({
  email: z.string().optional(),
  displayName: z.string().optional(),
  self: z.boolean().optional(),
});
const attendee = person.extend({
  organizer: z.boolean().optional(),
  optional: z.boolean().optional(),
  resource: z.boolean().optional(),
  responseStatus: z.enum(googleResponses).catch("needsAction"),
});
const eventTime = z.object({
  date: z.string().optional(),
  dateTime: z.string().optional(),
  timeZone: z.string().optional(),
});
export const googleEvent = z.object({
  id: z.string(),
  status: z.enum(calendarEventStatuses).catch("confirmed"),
  iCalUID: z.string().optional(),
  recurringEventId: z.string().optional(),
  // A missing type is a default event; a type this adapter does not know is `other`.
  eventType: z.enum(googleKinds).optional().catch("other"),
  summary: z.string().optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  htmlLink: z.string().optional(),
  hangoutLink: z.string().optional(),
  conferenceData: z
    .object({
      entryPoints: z
        .array(z.object({ entryPointType: z.string().optional(), uri: z.string().optional() }))
        .optional(),
    })
    .optional(),
  visibility: z.enum(calendarEventVisibilities).catch("default"),
  start: eventTime.optional(),
  end: eventTime.optional(),
  updated: z.string().optional(),
  organizer: person.optional(),
  attendees: z.array(attendee).optional(),
});
export type GoogleEvent = z.output<typeof googleEvent>;

const eventPage = z.object({
  items: z.array(z.unknown()).default([]),
  nextPageToken: z.string().optional(),
  nextSyncToken: z.string().optional(),
});
const calendarListPage = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        summary: z.string().optional(),
        summaryOverride: z.string().optional(),
        backgroundColor: z.string().optional(),
        timeZone: z.string().optional(),
        primary: z.boolean().optional(),
      }),
    )
    .default([]),
  nextPageToken: z.string().optional(),
});
/** All-day dates become UTC midnight. Timed values become UTC ISO strings. */
function instant(time: z.output<typeof eventTime> | undefined) {
  if (time?.date) return { at: `${time.date}T00:00:00.000Z`, allDay: true };
  const parsed = time?.dateTime ? new Date(time.dateTime) : undefined;
  if (!parsed || Number.isNaN(parsed.getTime())) return undefined;
  return { at: parsed.toISOString(), allDay: false };
}

const normalizeEmail = (email: string) => email.trim().toLowerCase();
// Group and resource calendars organize events too; they are not people.
const isCalendarAddress = (email: string) => email.endsWith("calendar.google.com");

function attendees(event: GoogleEvent): ProviderCalendarAttendee[] {
  const listed = (event.attendees ?? []).flatMap((entry): ProviderCalendarAttendee[] =>
    entry.email
      ? [
          {
            email: normalizeEmail(entry.email),
            displayName: entry.displayName ?? null,
            responseStatus: responses[entry.responseStatus],
            isOrganizer: entry.organizer ?? false,
            isSelf: entry.self ?? false,
            isOptional: entry.optional ?? false,
            isResource: entry.resource ?? false,
          },
        ]
      : [],
  );
  // Google omits the attendee list when the organizer invited only the owner.
  const organizer = event.organizer;
  const organizerEmail = organizer?.email ? normalizeEmail(organizer.email) : undefined;
  const organizerIsPerson =
    organizerEmail !== undefined && !organizer?.self && !isCalendarAddress(organizerEmail);
  const organizerListed = listed.some((entry) => entry.email === organizerEmail);
  if (organizerIsPerson && !organizerListed)
    listed.push({
      email: organizerEmail,
      displayName: organizer?.displayName ?? null,
      responseStatus: "accepted",
      isOrganizer: true,
      isSelf: false,
      isOptional: false,
      isResource: false,
    });
  return listed;
}

/** Returns undefined for an event without usable times. */
export function normalizeGoogleEvent(event: GoogleEvent): ProviderCalendarEvent | undefined {
  const start = instant(event.start);
  const end = instant(event.end) ?? start;
  if (!start || !end) return undefined;
  const video = event.conferenceData?.entryPoints?.find(
    (entry) => entry.entryPointType === "video" && entry.uri,
  );
  return {
    providerEventId: event.id,
    icalUid: event.iCalUID ?? null,
    recurringEventId: event.recurringEventId ?? null,
    kind: kinds[event.eventType ?? "default"],
    status: event.status,
    title: event.summary ?? "",
    description: event.description ?? null,
    location: event.location ?? null,
    conferenceUrl: event.hangoutLink ?? video?.uri ?? null,
    htmlLink: event.htmlLink ?? null,
    visibility: event.visibility,
    startsAt: start.at,
    endsAt: end.at,
    allDay: start.allDay,
    timeZone: event.start?.timeZone ?? null,
    providerUpdatedAt: event.updated ?? null,
    attendees: attendees(event),
  };
}

/**
 * Maps a Google failure to its calendar error, with the Google error as `cause`. Its `errorCode`
 * stays Google's.
 */
export function calendarError(error: GoogleError) {
  const { errorCode, message } = error;
  if (error instanceof GoogleReauthRequired || error instanceof GoogleScopeMissing)
    return new CalendarAccessRequired(errorCode, message, { cause: error });
  if (error instanceof GoogleGone)
    return new CalendarCursorExpired(errorCode, message, { cause: error });
  if (errorCode === "provider_not_configured") return new ProviderNotConfigured({ cause: error });
  return new CalendarProviderFailure(errorCode, message, { cause: error });
}

async function mapped<T>(call: () => Promise<T>) {
  try {
    return await call();
  } catch (error) {
    // Errors that are not Google's pass through unchanged.
    throw error instanceof GoogleError ? calendarError(error) : error;
  }
}

/**
 * The Google Calendar adapter. Calls, including the token load, throw calendar errors: an expired
 * sync token is CalendarCursorExpired, and a grant without calendar access is
 * CalendarAccessRequired.
 */
export function createGoogleCalendar(deps: {
  /** Loads the account's token with the calendar product's scopes. */
  accessToken: (account: CalendarAccountRef) => Promise<string>;
  fetch?: GoogleFetch;
  sleep?: (ms: number) => Promise<void>;
}): CalendarProviderAdapter {
  async function client(account: CalendarAccountRef): Promise<GoogleClient> {
    const token = await deps.accessToken(account);
    return createGoogleClient({ token, product: "calendar", fetch: deps.fetch, sleep: deps.sleep });
  }
  const url = (path: string, query: URLSearchParams) => `${api}${path}?${query}`;

  const adapter: CalendarProviderAdapter = {
    async listCalendars(account) {
      const google = await client(account);
      const calendars: ProviderCalendar[] = [];
      const pages = googlePages(async (pageToken) => {
        const query = new URLSearchParams({ maxResults: "250" });
        if (pageToken) query.set("pageToken", pageToken);
        return google.get(url("/users/me/calendarList", query), calendarListPage);
      });
      for await (const page of pages)
        for (const item of page.items)
          calendars.push({
            providerCalendarId: item.id,
            name: item.summaryOverride ?? item.summary ?? "",
            color: item.backgroundColor ?? null,
            timeZone: item.timeZone ?? null,
            isPrimary: item.primary ?? false,
          });
      return calendars;
    },

    async syncEvents(account, { providerCalendarId, syncCursor, syncWindowStart, now }) {
      const google = await client(account);
      const fullSync = syncCursor === null;
      const result: ProviderSyncResult = {
        fullSync,
        events: [],
        cancelledEventIds: [],
        nextCursor: null,
      };
      const path = `/calendars/${encodeURIComponent(providerCalendarId)}/events`;
      const pages = googlePages(async (pageToken) => {
        // Incremental syncs repeat the full sync's parameters except the window. Google always
        // returns deleted events with a sync token.
        const query = new URLSearchParams({ singleEvents: "true", maxResults: "2500" });
        if (syncCursor === null) {
          query.set("showDeleted", "false");
          query.set("timeMin", syncWindowStart.toISOString());
          query.set("timeMax", new Date(now.getTime() + syncFutureDays * 86_400_000).toISOString());
        } else {
          query.set("showDeleted", "true");
          query.set("syncToken", syncCursor);
        }
        if (pageToken) query.set("pageToken", pageToken);
        return google.get(url(path, query), eventPage);
      });
      for await (const page of pages)
        for (const item of page.items) {
          const parsed = googleEvent.safeParse(item);
          if (!parsed.success) continue;
          // A full sync drops cancelled occurrences: events it does not list are gone anyway.
          if (parsed.data.status === "cancelled") {
            if (!fullSync) result.cancelledEventIds.push(parsed.data.id);
            continue;
          }
          const event = normalizeGoogleEvent(parsed.data);
          if (event) result.events.push(event);
        }
      if (!pages.nextSyncToken)
        throw new CalendarProviderFailure("provider_no_cursor", "Google gave no sync cursor.");
      result.nextCursor = pages.nextSyncToken;
      return result;
    },
  };
  return {
    listCalendars: (account) => mapped(() => adapter.listCalendars(account)),
    syncEvents: (account, input) => mapped(() => adapter.syncEvents(account, input)),
  };
}
