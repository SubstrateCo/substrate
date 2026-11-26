import type { ApiInput } from "@substrate/contracts/http-result";

import { api } from "../client";
import { readResult } from "../result";

type Workspace = { organizationId: string };
const calendar = api.calendar;

export const getCalendarSettings = ({ data, signal }: ApiInput<Workspace>) =>
  readResult(calendar.settings.$get({ query: data }, { init: { signal } }));

export const listProviderCalendars = ({
  data: { credentialAccountId, ...query },
  signal,
}: ApiInput<Workspace & { credentialAccountId: string }>) =>
  readResult(
    calendar.accounts[":credentialAccountId"].calendars.$get(
      { param: { credentialAccountId }, query },
      { init: { signal } },
    ),
  );

export const connectCalendars = ({
  data,
  signal,
}: ApiInput<Workspace & { credentialAccountId: string; providerCalendarIds: string[] }>) =>
  readResult(calendar.connect.$post({ json: data }, { init: { signal } }));

export const updateCalendar = ({
  data: { calendarEntityId, ...json },
  signal,
}: ApiInput<
  Workspace & { calendarEntityId: string; recordsInteractions?: boolean; paused?: boolean }
>) =>
  readResult(
    calendar.calendars[":calendarEntityId"].$patch(
      { param: { calendarEntityId }, json },
      { init: { signal } },
    ),
  );

export const runCalendarAction = ({
  data: { calendarEntityId, action, ...json },
  signal,
}: ApiInput<Workspace & { calendarEntityId: string; action: "disconnect" | "backfill" }>) => {
  const route = calendar.calendars[":calendarEntityId"];
  const request = { param: { calendarEntityId }, json };
  return readResult(
    action === "disconnect"
      ? route.disconnect.$post(request, { init: { signal } })
      : route.backfill.$post(request, { init: { signal } }),
  );
};

export const listCalendarEvents = ({
  data,
  signal,
}: ApiInput<Workspace & { from: string; until: string; calendarEntityIds?: string[] }>) =>
  readResult(calendar.events.$get({ query: data }, { init: { signal } }));

export const getCalendarEvent = ({
  data: { entityId, ...query },
  signal,
}: ApiInput<Workspace & { entityId: string }>) =>
  readResult(
    calendar.events[":entityId"].$get({ param: { entityId }, query }, { init: { signal } }),
  );

export const listContactMeetings = ({
  data: { contactEntityId, organizationId, limit },
  signal,
}: ApiInput<Workspace & { contactEntityId: string; limit?: number }>) =>
  readResult(
    calendar.contacts[":contactEntityId"].meetings.$get(
      {
        param: { contactEntityId },
        query: { organizationId, limit: limit === undefined ? undefined : String(limit) },
      },
      { init: { signal } },
    ),
  );

export const getInteractionSources = ({
  data,
  signal,
}: ApiInput<Workspace & { interactionEntityIds: string[] }>) =>
  readResult(calendar["interaction-sources"].$post({ json: data }, { init: { signal } }));
