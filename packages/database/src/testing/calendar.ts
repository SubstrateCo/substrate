import {
  googleCalendarScope,
  type ProviderCalendar,
  type ProviderCalendarAttendee,
  type ProviderCalendarEvent,
  type ProviderSyncResult,
} from "@substrate/contracts/calendar";

import type { DatabaseExecutor } from "../core/executor";
import { commitCalendarSync, type CalendarSyncClaim } from "../features/calendar/sync";
import { createRepositories } from "../repositories";
import { account, calendars, organizationApps, user } from "../schema";
import { eq } from "drizzle-orm";

export async function enableCalendarApp(db: DatabaseExecutor, organizationId: string) {
  await db
    .insert(organizationApps)
    .values({ organizationId, appId: "calendar", enabled: true })
    .onConflictDoUpdate({
      target: [organizationApps.organizationId, organizationApps.appId],
      set: { enabled: true },
    });
}

export async function linkCalendarAccount(
  db: DatabaseExecutor,
  userId: string,
  options: { id?: string; scope?: string | null; idToken?: string | null } = {},
) {
  const id = options.id ?? crypto.randomUUID();
  await db.insert(account).values({
    id,
    userId,
    accountId: `google-${id}`,
    providerId: "google",
    scope: options.scope === undefined ? `openid,email,${googleCalendarScope}` : options.scope,
    idToken: options.idToken ?? null,
  });
  return id;
}

export async function connectCalendar(
  db: DatabaseExecutor,
  options: {
    userId: string;
    organizationId: string;
    credentialAccountId?: string;
    calendar?: Partial<ProviderCalendar>;
  },
) {
  await db.update(user).set({ emailVerified: true }).where(eq(user.id, options.userId));
  await enableCalendarApp(db, options.organizationId);
  const credentialAccountId =
    options.credentialAccountId ?? (await linkCalendarAccount(db, options.userId));
  const repositories = await createRepositories(db).forSession({
    userId: options.userId,
    organizationId: options.organizationId,
  });
  const { result } = await repositories.calendar.connect({
    credentialAccountId,
    calendars: [
      {
        providerCalendarId: "primary@example.com",
        name: "Work",
        color: null,
        timeZone: "UTC",
        isPrimary: true,
        ...options.calendar,
      },
    ],
  });
  return { calendar: result[0]!, credentialAccountId };
}

export function providerAttendee(
  email: string,
  options: Partial<ProviderCalendarAttendee> = {},
): ProviderCalendarAttendee {
  return {
    email,
    displayName: null,
    responseStatus: "accepted",
    isOrganizer: false,
    isSelf: false,
    isOptional: false,
    isResource: false,
    ...options,
  };
}

export function providerEvent(
  options: Partial<ProviderCalendarEvent> & Pick<ProviderCalendarEvent, "providerEventId">,
): ProviderCalendarEvent {
  return {
    icalUid: null,
    recurringEventId: null,
    kind: "default",
    status: "confirmed",
    title: "Meeting",
    description: null,
    location: null,
    conferenceUrl: null,
    htmlLink: null,
    visibility: "default",
    startsAt: "2026-01-01T10:00:00.000Z",
    endsAt: "2026-01-01T11:00:00.000Z",
    allDay: false,
    timeZone: null,
    providerUpdatedAt: null,
    attendees: [],
    ...options,
  };
}

export async function leaseCalendar(
  db: DatabaseExecutor,
  calendarEntityId: string,
  leaseMs = 60_000,
): Promise<CalendarSyncClaim> {
  const leaseToken = crypto.randomUUID();
  const [row] = await db
    .update(calendars)
    .set({ syncLeaseToken: leaseToken, syncLeaseExpiresAt: new Date(Date.now() + leaseMs) })
    .where(eq(calendars.entityId, calendarEntityId))
    .returning();
  if (!row?.credentialAccountId) throw new Error("The calendar has no credential.");
  return {
    organizationId: row.organizationId,
    calendarEntityId: row.entityId,
    ownerUserId: row.ownerUserId,
    ownerActorEntityId: row.ownerActorEntityId,
    credentialAccountId: row.credentialAccountId,
    provider: row.provider,
    providerCalendarId: row.providerCalendarId,
    syncCursor: row.syncCursor,
    syncWindowStart: row.syncWindowStart,
    leaseToken,
  };
}

export async function syncCalendarEvents(
  db: DatabaseExecutor,
  calendarEntityId: string,
  events: ProviderCalendarEvent[],
  options: Partial<Omit<ProviderSyncResult, "events">> = {},
) {
  const claim = await leaseCalendar(db, calendarEntityId);
  const { result } = await commitCalendarSync(db, {
    claim,
    result: { fullSync: false, cancelledEventIds: [], nextCursor: "cursor", ...options, events },
  });
  if (!result.committed) throw new Error("The sync commit lost its lease.");
}
