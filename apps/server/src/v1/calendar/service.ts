import type {
  CalendarConnectInput,
  CalendarEventRangeInput,
  CalendarUpdateInput,
  ContactMeetingsInput,
} from "@substrate/contracts/calendar/input";

import type { CommittedPublisher } from "../../shared/committed";
import type { WorkspaceScope } from "../../shared/scope-types";
import { ServiceError, serviceResult } from "../../shared/service-result";
import {
  CalendarAccessRequired,
  CalendarProviderError,
  ProviderNotConfigured,
  ProviderNotImplemented,
} from "./errors";
import type { CalendarProviders } from "./providers";

export interface CalendarServiceDependencies {
  providers: CalendarProviders;
  triggerSync: () => void;
}

const calendarAccessRequired = () =>
  new ServiceError("FORBIDDEN", "Reconnect with calendar access.", "CALENDAR_ACCESS_REQUIRED");

function providerError(error: CalendarProviderError) {
  if (error instanceof CalendarAccessRequired) return calendarAccessRequired();
  const unavailable =
    error instanceof ProviderNotConfigured || error instanceof ProviderNotImplemented;
  if (unavailable)
    return new ServiceError("INVALID_INPUT", "This calendar provider is not available.");
  return error;
}

export function createCalendarService(
  deps: CalendarServiceDependencies & { publish: CommittedPublisher },
) {
  const { providers, triggerSync, publish } = deps;

  async function providerCalendars(scope: WorkspaceScope, credentialAccountId: string) {
    const settings = await scope.repositories.calendar.settings();
    const account = settings.accounts.find(
      (candidate) => candidate.credentialAccountId === credentialAccountId,
    );
    if (!account) throw new ServiceError("NOT_FOUND", "Calendar account not found.");
    if (!account.hasCalendarAccess) throw calendarAccessRequired();
    try {
      const calendars = await providers
        .adapter(account.provider)
        .listCalendars({ userId: scope.userId, accountId: credentialAccountId });
      return { account, calendars };
    } catch (error) {
      throw error instanceof CalendarProviderError ? providerError(error) : error;
    }
  }

  return {
    settings: (scope: WorkspaceScope) =>
      serviceResult(async () => ({
        providers: providers.configured,
        ...(await scope.repositories.calendar.settings()),
      })),

    providerCalendars: (scope: WorkspaceScope, credentialAccountId: string) =>
      serviceResult(async () => {
        const { account, calendars } = await providerCalendars(scope, credentialAccountId);
        const connected = new Map(
          account.calendars.map((calendar) => [calendar.providerCalendarId, calendar.entityId]),
        );
        return calendars.map((calendar) => ({
          ...calendar,
          connectedEntityId: connected.get(calendar.providerCalendarId) ?? null,
        }));
      }),

    connect: (scope: WorkspaceScope, input: CalendarConnectInput) =>
      serviceResult(async () => {
        const { calendars } = await providerCalendars(scope, input.credentialAccountId);
        const requested = new Set(input.providerCalendarIds);
        const chosen = calendars.filter((calendar) => requested.has(calendar.providerCalendarId));
        if (chosen.length === 0) throw new ServiceError("NOT_FOUND", "Calendar not found.");
        const connected = await publish(
          await scope.repositories.calendar.connect({
            credentialAccountId: input.credentialAccountId,
            calendars: chosen,
          }),
        );
        triggerSync();
        return connected;
      }),

    update: (scope: WorkspaceScope, input: Omit<CalendarUpdateInput, "organizationId">) =>
      serviceResult(async () => {
        const calendar = await publish(await scope.repositories.calendar.update(input));
        if (input.paused === false) triggerSync();
        return calendar;
      }),

    disconnect: (scope: WorkspaceScope, calendarEntityId: string) =>
      serviceResult(async () =>
        publish(await scope.repositories.calendar.disconnect({ calendarEntityId })),
      ),

    backfill: (scope: WorkspaceScope, calendarEntityId: string) =>
      serviceResult(async () => {
        const calendar = await publish(
          await scope.repositories.calendar.backfill({ calendarEntityId }),
        );
        triggerSync();
        return calendar;
      }),

    events: (scope: WorkspaceScope, input: Omit<CalendarEventRangeInput, "organizationId">) =>
      serviceResult(() => scope.repositories.calendar.events(input)),

    event: (scope: WorkspaceScope, entityId: string) =>
      serviceResult(() => scope.repositories.calendar.event(entityId)),

    contactMeetings: (scope: WorkspaceScope, input: Omit<ContactMeetingsInput, "organizationId">) =>
      serviceResult(() => scope.repositories.calendar.contactMeetings(input)),

    interactionSources: (scope: WorkspaceScope, interactionEntityIds: string[]) =>
      serviceResult(() =>
        scope.repositories.calendar.interactionSourceEvents(interactionEntityIds),
      ),
  };
}
export type CalendarService = ReturnType<typeof createCalendarService>;
