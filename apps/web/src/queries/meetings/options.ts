import type { CalendarInput, MeetingListInput, MeetingScope } from "@substrate/contracts/meetings";

import { queryOptions } from "@tanstack/react-query";

import {
  listMeetings,
  meetingCalendar,
  getMeeting,
  getOriginal,
  meetingSources,
  matchReviews,
} from "@/api/meetings/requests";
import { localTimeZone } from "@/lib/format/date";
import { queryKeys } from "@/queries/keys";

export function meetingQueries(scope: MeetingScope) {
  const root = queryKeys.meetings(scope.userId, scope.organizationId);
  const timeZone = localTimeZone();
  return {
    root,
    organizationId: scope.organizationId,
    list: (query: MeetingListInput) =>
      queryOptions({
        queryKey: [...root, "list", scope, query, timeZone],
        queryFn: ({ signal }) => listMeetings(scope, { ...query, timeZone }, signal),
        retry: false,
      }),
    calendar: (query: CalendarInput) =>
      queryOptions({
        queryKey: [...root, "calendar", scope, query, timeZone],
        queryFn: ({ signal }) => meetingCalendar(scope, { ...query, timeZone }, signal),
        retry: false,
      }),
    detail: (id: string) =>
      queryOptions({
        queryKey: [...root, "detail", scope, id, timeZone],
        queryFn: ({ signal }) => getMeeting(scope, id, timeZone, signal),
        retry: false,
      }),
    original: (id: string) =>
      queryOptions({
        queryKey: [...root, "original", scope, id],
        queryFn: ({ signal }) => getOriginal(scope, id, signal),
        retry: false,
      }),
    sources: queryOptions({
      queryKey: [...root, "sources", scope],
      queryFn: ({ signal }) => meetingSources(scope, signal),
      retry: false,
    }),
    reviews: queryOptions({
      queryKey: [...root, "reviews", scope, timeZone],
      queryFn: ({ signal }) => matchReviews(scope, timeZone, signal),
      retry: false,
    }),
  };
}
export type MeetingQueries = ReturnType<typeof meetingQueries>;
