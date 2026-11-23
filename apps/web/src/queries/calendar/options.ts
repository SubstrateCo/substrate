import { queryOptions } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import {
  getCalendarEvent,
  getCalendarSettings,
  getInteractionSources,
  listCalendarEvents,
  listContactMeetings,
  listProviderCalendars,
} from "@/api/calendar/requests";

export const calendarSettingsOptions = (organizationId: string) =>
  queryOptions({
    queryKey: queryKeys.calendarSettings(organizationId),
    queryFn: ({ signal }) => getCalendarSettings({ data: { organizationId }, signal }),
    retry: false,
  });

/** The calendars in a linked account, read live from the provider when the dialog opens. */
export const providerCalendarsOptions = (organizationId: string, credentialAccountId: string) =>
  queryOptions({
    queryKey: [...queryKeys.calendarSettings(organizationId), "provider", credentialAccountId],
    queryFn: ({ signal }) =>
      listProviderCalendars({ data: { organizationId, credentialAccountId }, signal }),
    staleTime: 0,
    retry: false,
  });

/** Every connected calendar's events in a period. The view filters calendars locally. */
export const calendarEventsOptions = (
  organizationId: string,
  range: { from: string; until: string },
) =>
  queryOptions({
    queryKey: [...queryKeys.calendarEvents(organizationId), range],
    queryFn: ({ signal }) => listCalendarEvents({ data: { organizationId, ...range }, signal }),
    retry: false,
  });

export const calendarEventOptions = (organizationId: string, entityId: string) =>
  queryOptions({
    queryKey: queryKeys.calendarEvent(organizationId, entityId),
    queryFn: ({ signal }) => getCalendarEvent({ data: { organizationId, entityId }, signal }),
    retry: false,
  });

export const contactMeetingsLimit = 20;

export const contactMeetingsOptions = (organizationId: string, contactEntityId: string) =>
  queryOptions({
    queryKey: [...queryKeys.calendarEvents(organizationId), "contact", contactEntityId],
    queryFn: ({ signal }) =>
      listContactMeetings({
        data: { organizationId, contactEntityId, limit: contactMeetingsLimit },
        signal,
      }),
    retry: false,
  });

/**
 * The meetings that calendar interactions came from, in one request per list. The server returns
 * only the sources the viewer can read, so the others show just the interaction.
 */
export const interactionSourcesOptions = (
  organizationId: string,
  interactionEntityIds: string[],
) => {
  const ids = [...interactionEntityIds].sort();
  return queryOptions({
    queryKey: [...queryKeys.calendar(organizationId), "interaction-sources", ids],
    queryFn: ({ signal }) =>
      getInteractionSources({ data: { organizationId, interactionEntityIds: ids }, signal }),
    enabled: ids.length > 0,
    retry: false,
  });
};
