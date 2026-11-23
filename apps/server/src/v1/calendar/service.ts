import type {
  CalendarConnectInput,
  CalendarEventRangeInput,
  CalendarUpdateInput,
  ContactMeetingsInput,
} from "@substrate/contracts/calendar/input";

import { GoogleError, GoogleReauthRequired, GoogleScopeMissing } from "../../integrations/google";
import type { CommittedPublisher } from "../../shared/committed";
import type { WorkspaceScope } from "../../shared/scope-types";
import { ServiceError, serviceResult } from "../../shared/service-result";
import { CalendarProviderError, type ProviderFailure } from "./errors";
import type { CalendarProviders } from "./providers";

export interface CalendarServiceDependencies {
  providers: CalendarProviders;
  /** Starts a sync run now, so a connected or resumed calendar does not wait for the poll. */
  triggerSync: () => void;
}

const calendarAccessRequired = () =>
  new ServiceError("FORBIDDEN", "Reconnect with calendar access.", "CALENDAR_ACCESS_REQUIRED");

/**
 * Maps provider failures to public errors. A missing scope or a revoked grant both ask the owner
 * to reconnect. Others stay unexpected and are logged by name.
 */
function providerError(error: ProviderFailure) {
  if (error instanceof GoogleScopeMissing || error instanceof GoogleReauthRequired)
    return calendarAccessRequired();
  const unavailable =
    error instanceof CalendarProviderError || error.errorCode === "provider_not_configured";
  if (unavailable)
    return new ServiceError("INVALID_INPUT", "This calendar provider is not available.");
  return error;
}

export function createCalendarService(
  deps: CalendarServiceDependencies & { publish: CommittedPublisher },
) {
  const { providers, triggerSync, publish } = deps;

  /** Lists the calendars of one of the session user's linked accounts, from the provider. */
  async function providerCalendars(scope: WorkspaceScope, credentialAccountId: string) {
    const settings = await scope.repositories.calendar.settings();
    // Settings lists only the session user's own linked accounts.
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
      const known = error instanceof GoogleError || error instanceof CalendarProviderError;
      throw known ? providerError(error) : error;
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
        // Names and IDs come from the provider, never from the request.
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
