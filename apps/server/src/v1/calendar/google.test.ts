import { GoogleError, GoogleGone, GoogleScopeMissing } from "../../integrations/google";
import { createGoogleCalendar, googleEvent, normalizeGoogleEvent } from "./google";
import { describe, expect, test } from "bun:test";

/** Google response JSON. Fixtures go through the same parser as provider responses. */
type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
const normalize = (event: Json) => normalizeGoogleEvent(googleEvent.parse(event));

describe("Google event normalization", () => {
  test("a timed meeting keeps its people, roles, responses and video link", () => {
    expect(
      normalize({
        id: "event-1",
        status: "confirmed",
        iCalUID: "ical-1@google.com",
        eventType: "default",
        summary: "Pipeline review",
        description: "Agenda",
        location: "Room 4",
        htmlLink: "https://calendar.google.com/event?eid=1",
        visibility: "private",
        start: { dateTime: "2026-11-23T10:00:00-05:00", timeZone: "America/Toronto" },
        end: { dateTime: "2026-11-23T10:30:00-05:00", timeZone: "America/Toronto" },
        updated: "2026-11-20T12:00:00.000Z",
        conferenceData: {
          entryPoints: [
            { entryPointType: "phone", uri: "tel:+1-555-0100" },
            { entryPointType: "video", uri: "https://meet.example.test/abc" },
          ],
        },
        organizer: { email: "Lead@Partner.example", displayName: "Lead" },
        attendees: [
          { email: "me@example.test", self: true, responseStatus: "accepted" },
          {
            email: "Lead@Partner.example",
            displayName: "Lead",
            organizer: true,
            responseStatus: "needsAction",
          },
          { email: "optional@partner.example", optional: true, responseStatus: "tentative" },
          {
            email: "room@resource.calendar.google.com",
            resource: true,
            responseStatus: "accepted",
          },
          { displayName: "No email" },
        ],
      }),
    ).toEqual({
      providerEventId: "event-1",
      icalUid: "ical-1@google.com",
      recurringEventId: null,
      kind: "default",
      status: "confirmed",
      title: "Pipeline review",
      description: "Agenda",
      location: "Room 4",
      conferenceUrl: "https://meet.example.test/abc",
      htmlLink: "https://calendar.google.com/event?eid=1",
      visibility: "private",
      startsAt: "2026-11-23T15:00:00.000Z",
      endsAt: "2026-11-23T15:30:00.000Z",
      allDay: false,
      timeZone: "America/Toronto",
      providerUpdatedAt: "2026-11-20T12:00:00.000Z",
      attendees: [
        {
          email: "me@example.test",
          displayName: null,
          responseStatus: "accepted",
          isOrganizer: false,
          isSelf: true,
          isOptional: false,
          isResource: false,
        },
        {
          email: "lead@partner.example",
          displayName: "Lead",
          responseStatus: "needs_action",
          isOrganizer: true,
          isSelf: false,
          isOptional: false,
          isResource: false,
        },
        {
          email: "optional@partner.example",
          displayName: null,
          responseStatus: "tentative",
          isOrganizer: false,
          isSelf: false,
          isOptional: true,
          isResource: false,
        },
        {
          email: "room@resource.calendar.google.com",
          displayName: null,
          responseStatus: "accepted",
          isOrganizer: false,
          isSelf: false,
          isOptional: false,
          isResource: true,
        },
      ],
    });
  });

  test("an all-day event without a title starts and ends at UTC midnight", () => {
    expect(
      normalize({
        id: "holiday",
        start: { date: "2026-12-24" },
        end: { date: "2026-12-26" },
      }),
    ).toMatchObject({
      title: "",
      allDay: true,
      startsAt: "2026-12-24T00:00:00.000Z",
      endsAt: "2026-12-26T00:00:00.000Z",
      timeZone: null,
      kind: "default",
      status: "confirmed",
      visibility: "default",
      attendees: [],
    });
  });

  test("Google event types map to contract kinds, and unknown types are other", async () => {
    const types = [
      "default",
      "focusTime",
      "outOfOffice",
      "workingLocation",
      "birthday",
      "fromGmail",
      "newType",
    ];
    const items = types.map((eventType) => ({
      id: eventType,
      eventType,
      start: { date: "2026-12-01" },
      end: { date: "2026-12-02" },
    }));
    const { adapter } = provider([{ body: { items, nextSyncToken: "cursor" } }]);
    const result = await adapter.syncEvents(account, { ...window, syncCursor: null });
    const kinds = Object.fromEntries(
      result.events.map((entry) => [entry.providerEventId, entry.kind]),
    );
    expect(kinds).toEqual({
      default: "default",
      focusTime: "focus_time",
      outOfOffice: "out_of_office",
      workingLocation: "working_location",
      birthday: "birthday",
      fromGmail: "from_gmail",
      newType: "other",
    });
  });

  test("a recurring occurrence keeps its own ID and the series ID, and prefers the Meet link", () => {
    expect(
      normalize({
        id: "series_20261123T150000Z",
        recurringEventId: "series",
        hangoutLink: "https://meet.google.com/aaa-bbbb-ccc",
        conferenceData: { entryPoints: [{ entryPointType: "video", uri: "https://other.test" }] },
        start: { dateTime: "2026-11-23T15:00:00Z" },
        end: { dateTime: "2026-11-23T15:30:00Z" },
      }),
    ).toMatchObject({
      providerEventId: "series_20261123T150000Z",
      recurringEventId: "series",
      conferenceUrl: "https://meet.google.com/aaa-bbbb-ccc",
    });
  });

  test("an organizer that Google leaves out of the attendees is added, except the owner or a group calendar", () => {
    const times = {
      start: { dateTime: "2026-11-23T15:00:00Z" },
      end: { dateTime: "2026-11-23T16:00:00Z" },
    };
    expect(
      normalize({ id: "1", ...times, organizer: { email: "host@partner.example" } })?.attendees,
    ).toEqual([
      {
        email: "host@partner.example",
        displayName: null,
        responseStatus: "accepted",
        isOrganizer: true,
        isSelf: false,
        isOptional: false,
        isResource: false,
      },
    ]);
    expect(
      normalize({ id: "2", ...times, organizer: { email: "me@example.test", self: true } })
        ?.attendees,
    ).toEqual([]);
    expect(
      normalize({ id: "3", ...times, organizer: { email: "team@group.calendar.google.com" } })
        ?.attendees,
    ).toEqual([]);
  });

  test("an event without usable times is skipped", () => {
    expect(normalize({ id: "broken", start: { dateTime: "not a date" } })).toBeUndefined();
  });
});

type Page = { status?: number; body: Json };
const account = { userId: "user-1", accountId: "account-row-1" };
function provider(pages: Page[]) {
  const urls: URL[] = [];
  const tokens: unknown[] = [];
  const authorization: (string | null)[] = [];
  const adapter = createGoogleCalendar({
    accessToken: async (input) => {
      tokens.push(input);
      return "token";
    },
    fetch: async (url, init) => {
      urls.push(new URL(url));
      authorization.push(new Headers(init.headers).get("authorization"));
      const page = pages.shift();
      if (!page) throw new Error("No more fixture pages.");
      return Response.json(page.body, { status: page.status ?? 200 });
    },
    sleep: async () => {},
  });
  return { adapter, urls, tokens, authorization };
}
const window = {
  providerCalendarId: "team@example.test",
  syncWindowStart: new Date("2026-10-24T00:00:00Z"),
  now: new Date("2026-11-23T00:00:00Z"),
};
const event = (id: string, status = "confirmed") => ({
  id,
  status,
  start: { dateTime: "2026-11-23T15:00:00Z" },
  end: { dateTime: "2026-11-23T16:00:00Z" },
});
async function syncError(pages: Page[], syncCursor: string | null = "cursor") {
  try {
    await provider(pages).adapter.syncEvents(account, { ...window, syncCursor });
  } catch (error) {
    if (error instanceof GoogleError)
      return { type: error.constructor, errorCode: error.errorCode };
    throw error;
  }
  throw new Error("Expected the sync to fail.");
}

describe("Google Calendar failures", () => {
  test("an expired sync token is Gone, and a grant without calendar access names the calendar", async () => {
    expect(await syncError([{ status: 410, body: { error: { code: 410 } } }])).toEqual({
      type: GoogleGone,
      errorCode: "provider_gone",
    });
    expect(
      await syncError([
        {
          status: 403,
          body: { error: { details: [{ reason: "ACCESS_TOKEN_SCOPE_INSUFFICIENT" }] } },
        },
      ]),
    ).toEqual({ type: GoogleScopeMissing, errorCode: "calendar_scope_missing" });
  });

  test("a last page without a sync token fails instead of saving no cursor", async () => {
    expect(await syncError([{ body: { items: [event("a")] } }], null)).toMatchObject({
      errorCode: "provider_no_cursor",
    });
  });
});

describe("Google sync paging", () => {
  test("a full sync pages through the window and returns the final cursor", async () => {
    const { adapter, urls, tokens, authorization } = provider([
      { body: { items: [event("a")], nextPageToken: "page-2" } },
      { body: { items: [event("b"), event("gone", "cancelled")], nextSyncToken: "cursor-1" } },
    ]);
    const result = await adapter.syncEvents(account, { ...window, syncCursor: null });
    expect(result).toMatchObject({ fullSync: true, cancelledEventIds: [], nextCursor: "cursor-1" });
    expect(result.events.map((entry) => entry.providerEventId)).toEqual(["a", "b"]);
    // One token for the owner's account serves every page.
    expect(tokens).toEqual([account]);
    expect(authorization).toEqual(["Bearer token", "Bearer token"]);
    expect(urls.map((url) => url.pathname)).toEqual([
      "/calendar/v3/calendars/team%40example.test/events",
      "/calendar/v3/calendars/team%40example.test/events",
    ]);
    expect(urls.map((url) => Object.fromEntries(url.searchParams))).toEqual([
      {
        singleEvents: "true",
        maxResults: "2500",
        showDeleted: "false",
        timeMin: "2026-10-24T00:00:00.000Z",
        timeMax: "2027-05-22T00:00:00.000Z",
      },
      {
        singleEvents: "true",
        maxResults: "2500",
        showDeleted: "false",
        timeMin: "2026-10-24T00:00:00.000Z",
        timeMax: "2027-05-22T00:00:00.000Z",
        pageToken: "page-2",
      },
    ]);
  });

  test("an incremental sync returns changed events and cancelled IDs", async () => {
    const { adapter, urls } = provider([
      {
        body: {
          items: [event("changed"), event("removed", "cancelled")],
          nextSyncToken: "cursor-2",
        },
      },
    ]);
    const result = await adapter.syncEvents(account, { ...window, syncCursor: "cursor-1" });
    expect(result).toMatchObject({
      fullSync: false,
      cancelledEventIds: ["removed"],
      nextCursor: "cursor-2",
    });
    expect(result.events.map((entry) => entry.providerEventId)).toEqual(["changed"]);
    expect(urls.map((url) => Object.fromEntries(url.searchParams))).toEqual([
      { singleEvents: "true", maxResults: "2500", showDeleted: "true", syncToken: "cursor-1" },
    ]);
  });
});
