import { readCalendarFeed } from "./calendar-feed.ts";
import { expect, test } from "bun:test";

const range = {
  from: new Date("2026-11-22T08:45:00.000Z"),
  until: new Date("2026-11-22T20:45:00.000Z"),
};

test("an access failure or disabled app reads as unavailable; other failures throw", async () => {
  const read = (status: number) =>
    readCalendarFeed(
      { backend: "https://api.example.com", fetchAPI: async () => new Response("{}", { status }) },
      "org",
      range,
    );
  expect(await read(401)).toBeNull();
  expect(await read(403)).toBeNull();
  const failed = await read(500).then(
    () => false,
    () => true,
  );
  expect(failed).toBe(true);
});

test("requests the active organization's range and parses the result envelope", async () => {
  let requested = "";
  const event = {
    entityId: "00000000-0000-4000-8000-000000000001",
    calendarEntityId: "00000000-0000-4000-8000-000000000002",
    calendarName: "Work",
    color: null,
    title: "Planning",
    startsAt: "2026-11-22T10:00:00+01:00",
    endsAt: "2026-11-22T11:00:00+01:00",
    allDay: false,
    status: "confirmed",
    kind: "default",
    location: null,
    conferenceUrl: null,
    attendeeCount: 2,
    selfResponseStatus: null,
  };
  const events = await readCalendarFeed(
    {
      backend: "https://api.example.com",
      fetchAPI: async (url) => {
        requested = url;
        return Response.json({ success: true, data: [event] });
      },
    },
    "org",
    range,
  );
  expect(new URL(requested).pathname).toBe("/api/v1/calendar/events");
  expect(Object.fromEntries(new URL(requested).searchParams)).toEqual({
    organizationId: "org",
    from: range.from.toISOString(),
    until: range.until.toISOString(),
  });
  expect(events?.map((item) => item.entityId)).toEqual([event.entityId]);
});
