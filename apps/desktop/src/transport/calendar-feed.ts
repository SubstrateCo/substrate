import {
  attendeeResponseStatuses,
  calendarEventKinds,
  calendarEventStatuses,
} from "@substrate/contracts/calendar";
import { utcTimestamp } from "@substrate/contracts/timestamps";

import { z } from "zod";

const calendarEvent = z.object({
  entityId: z.uuid(),
  calendarName: z.string(),
  color: z.string().nullable(),
  title: z.string(),
  startsAt: utcTimestamp,
  endsAt: utcTimestamp,
  allDay: z.boolean(),
  status: z.enum(calendarEventStatuses),
  kind: z.enum(calendarEventKinds),
  conferenceUrl: z.string().nullable(),
  selfResponseStatus: z.enum(attendeeResponseStatuses).nullable(),
});
export type CalendarFeedEvent = z.infer<typeof calendarEvent>;

const feed = z.object({ success: z.literal(true), data: z.array(calendarEvent) });

export async function readCalendarFeed(
  options: {
    backend: string;
    fetchAPI: (url: string, init: RequestInit) => Promise<Response>;
  },
  organizationId: string,
  range: { from: Date; until: Date },
) {
  const url = new URL("/api/v1/calendar/events", options.backend);
  url.searchParams.set("organizationId", organizationId);
  url.searchParams.set("from", range.from.toISOString());
  url.searchParams.set("until", range.until.toISOString());
  const response = await options.fetchAPI(url.href, { method: "GET", redirect: "error" });
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error("Calendar unavailable.");
  return feed.parse(await response.json()).data;
}
