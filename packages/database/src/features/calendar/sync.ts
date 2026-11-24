import {
  calendarSyncIntervalMs,
  type CalendarProvider,
  type ProviderCalendarAttendee,
  type ProviderCalendarEvent,
  type ProviderSyncResult,
} from "@substrate/contracts/calendar";
import { newId } from "@substrate/contracts/ids";
import { realtimeKeys } from "@substrate/contracts/realtime";

import { activeActorCondition } from "../../core/actors/access";
import { actors } from "../../core/actors/schema";
import { commit, effectsFor, type Committed } from "../../core/effects";
import { entities } from "../../core/entities/schema";
import type { DatabaseExecutor } from "../../core/executor";
import { appEnabledCondition } from "../../core/permissions/app-visibility";
import { ValidationError } from "../../errors";
import { calendarEventAttendees, calendarEvents, calendars } from "./schema";
import {
  and,
  asc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  sql,
  type AnyColumn,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

export interface CalendarSyncClaim {
  organizationId: string;
  calendarEntityId: string;
  ownerUserId: string;
  ownerActorEntityId: string;
  credentialAccountId: string;
  provider: CalendarProvider;
  providerCalendarId: string;
  syncCursor: string | null;
  syncWindowStart: Date;
  leaseToken: string;
}

export type CalendarSyncFailure = "retry" | "reauth_required" | "reset";

const syncableStatuses = ["pending", "active", "error"] as const;
const retryDelayMs = 15 * 60_000;
// Keeps each statement well below PostgreSQL's 65,535 bind parameters.
const chunkSize = 500;
// interactions_recorded_at is not listed, so a recorded meeting stays recorded.
const updatedEventFields = [
  "icalUid",
  "recurringEventId",
  "kind",
  "status",
  "title",
  "description",
  "location",
  "conferenceUrl",
  "htmlLink",
  "visibility",
  "startsAt",
  "endsAt",
  "allDay",
  "timeZone",
  "providerUpdatedAt",
  "syncGeneration",
] as const satisfies readonly (keyof typeof calendarEvents.$inferInsert)[];

export function normalizeAttendeeEmail(email: string) {
  return email.trim().toLowerCase();
}

function chunks<T>(values: T[]) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += chunkSize)
    result.push(values.slice(index, index + chunkSize));
  return result;
}

function excluded(column: AnyColumn) {
  return sql.raw(`excluded."${column.name}"`);
}

// The calendar's entity audience reaches only readers of the calendar: its owner. The hint carries
// no data, so the owner's client refetches calendar views.
function calendarChanged(db: DatabaseExecutor, organizationId: string, calendarEntityId: string) {
  effectsFor(db).hint({
    audience: realtimeKeys.entity(organizationId, calendarEntityId),
    domain: "context",
  });
}

function leaseHeld(claim: CalendarSyncClaim, now: Date) {
  return and(
    eq(calendars.organizationId, claim.organizationId),
    eq(calendars.entityId, claim.calendarEntityId),
    eq(calendars.syncLeaseToken, claim.leaseToken),
    gt(calendars.syncLeaseExpiresAt, now),
    inArray(calendars.syncStatus, syncableStatuses),
  );
}

/**
 * Claims one due calendar across organizations with a new lease, in one statement. The owner must
 * still be an active member, the calendar app enabled, and the calendar connected.
 */
export async function claimCalendarSync(
  db: DatabaseExecutor,
  { leaseMs, now = new Date() }: { leaseMs: number; now?: Date },
): Promise<Committed<CalendarSyncClaim | null>> {
  if (!Number.isInteger(leaseMs) || leaseMs < 1)
    throw new ValidationError("The lease must be a positive number of milliseconds.");
  const calendarEntity = alias(entities, "calendar_entity");
  const ownerEntity = alias(entities, "owner_entity");
  const candidate = db.$with("candidate").as(
    db
      .select({ entityId: sql<string>`${calendars.entityId}`.as("candidate_entity_id") })
      .from(calendars)
      .innerJoin(
        calendarEntity,
        and(
          eq(calendarEntity.organizationId, calendars.organizationId),
          eq(calendarEntity.entityId, calendars.entityId),
          isNull(calendarEntity.deletedAt),
        ),
      )
      .innerJoin(
        actors,
        and(
          eq(actors.organizationId, calendars.organizationId),
          eq(actors.entityId, calendars.ownerActorEntityId),
        ),
      )
      .innerJoin(
        ownerEntity,
        and(
          eq(ownerEntity.organizationId, actors.organizationId),
          eq(ownerEntity.entityId, actors.entityId),
          isNull(ownerEntity.deletedAt),
        ),
      )
      .where(
        and(
          inArray(calendars.syncStatus, syncableStatuses),
          lte(calendars.nextSyncAt, now),
          or(isNull(calendars.syncLeaseExpiresAt), lte(calendars.syncLeaseExpiresAt, now)),
          isNotNull(calendars.credentialAccountId),
          activeActorCondition(),
          appEnabledCondition(calendars.organizationId, "calendar"),
        ),
      )
      .orderBy(asc(calendars.nextSyncAt))
      .limit(1)
      .for("update", { of: calendars, skipLocked: true }),
  );
  const leaseToken = crypto.randomUUID();
  const [row] = await db
    .with(candidate)
    .update(calendars)
    .set({ syncLeaseToken: leaseToken, syncLeaseExpiresAt: new Date(now.getTime() + leaseMs) })
    .from(candidate)
    .where(eq(calendars.entityId, candidate.entityId))
    .returning();
  // The claim is one atomic statement and changes nothing that a viewer sees.
  if (!row?.credentialAccountId) return { result: null, hints: [] };
  return {
    result: {
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
    },
    hints: [],
  };
}

function eventValues(
  claim: CalendarSyncClaim,
  entityId: string,
  event: ProviderCalendarEvent,
  generation: number,
): typeof calendarEvents.$inferInsert {
  const startsAt = new Date(event.startsAt);
  const endsAt = new Date(event.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()))
    throw new ValidationError(`Event ${event.providerEventId} has an invalid time.`);
  const providerUpdatedAt = event.providerUpdatedAt ? new Date(event.providerUpdatedAt) : null;
  return {
    entityId,
    organizationId: claim.organizationId,
    entityType: "calendar_event",
    calendarEntityId: claim.calendarEntityId,
    providerEventId: event.providerEventId,
    icalUid: event.icalUid,
    recurringEventId: event.recurringEventId,
    kind: event.kind,
    status: event.status,
    title: event.title,
    description: event.description,
    location: event.location,
    conferenceUrl: event.conferenceUrl,
    htmlLink: event.htmlLink,
    visibility: event.visibility,
    startsAt,
    // A provider end before its start would fail the time check and the whole sync.
    endsAt: endsAt < startsAt ? startsAt : endsAt,
    allDay: event.allDay,
    timeZone: event.timeZone,
    providerUpdatedAt:
      providerUpdatedAt && !Number.isNaN(providerUpdatedAt.getTime()) ? providerUpdatedAt : null,
    syncGeneration: generation,
  };
}

// One row per normalized email; the first listing wins.
function attendeeValues(
  organizationId: string,
  eventEntityId: string,
  attendees: ProviderCalendarAttendee[],
): (typeof calendarEventAttendees.$inferInsert)[] {
  const rows = new Map<string, typeof calendarEventAttendees.$inferInsert>();
  for (const attendee of attendees) {
    const normalizedEmail = normalizeAttendeeEmail(attendee.email);
    if (!normalizedEmail || rows.has(normalizedEmail)) continue;
    rows.set(normalizedEmail, {
      organizationId,
      eventEntityId,
      email: attendee.email.trim(),
      normalizedEmail,
      displayName: attendee.displayName,
      responseStatus: attendee.responseStatus,
      isOrganizer: attendee.isOrganizer,
      isSelf: attendee.isSelf,
      isOptional: attendee.isOptional,
      isResource: attendee.isResource,
    });
  }
  return [...rows.values()];
}

async function writeCalendarSync(
  db: DatabaseExecutor,
  {
    claim,
    result,
    now = new Date(),
  }: { claim: CalendarSyncClaim; result: ProviderSyncResult; now?: Date },
) {
  // The guarded write proves the lease and holds the row until commit, so a second commit for
  // this calendar waits and then finds the lease gone.
  const [calendar] = await db
    .update(calendars)
    .set({
      syncGeneration: sql`${calendars.syncGeneration} + ${result.fullSync ? 1 : 0}`,
      syncCursor: result.nextCursor,
      syncStatus: "active",
      lastSyncedAt: now,
      nextSyncAt: new Date(now.getTime() + calendarSyncIntervalMs),
      syncErrorCode: null,
      syncLeaseToken: null,
      syncLeaseExpiresAt: null,
    })
    .where(leaseHeld(claim, now))
    .returning({ generation: calendars.syncGeneration });
  if (!calendar) return { committed: false };
  const { generation } = calendar;
  const { organizationId, calendarEntityId } = claim;
  const ofCalendar = and(
    eq(calendarEvents.organizationId, organizationId),
    eq(calendarEvents.calendarEntityId, calendarEntityId),
  );

  const incoming = new Map(result.events.map((event) => [event.providerEventId, event]));
  const existing = new Map<string, string>();
  for (const ids of chunks([...incoming.keys()])) {
    const rows = await db
      .select({
        providerEventId: calendarEvents.providerEventId,
        entityId: calendarEvents.entityId,
      })
      .from(calendarEvents)
      .where(and(ofCalendar, inArray(calendarEvents.providerEventId, ids)));
    for (const row of rows) existing.set(row.providerEventId, row.entityId);
  }
  const created = [...incoming.keys()].flatMap((id) =>
    existing.has(id) ? [] : [[id, newId()] as const],
  );
  // Events are children of the calendar, which is a root and so its own access container. The
  // lease stands in for createChildEntity's access check: only the owner's sync holds it.
  for (const rows of chunks(created))
    await db.insert(entities).values(
      rows.map(([, entityId]) => ({
        entityId,
        organizationId,
        entityType: "calendar_event" as const,
        accessEntityId: calendarEntityId,
      })),
    );
  const entityIds = new Map([...existing, ...created]);

  const values = [...incoming.values()].map((event) =>
    eventValues(claim, entityIds.get(event.providerEventId)!, event, generation),
  );
  for (const rows of chunks(values))
    await db
      .insert(calendarEvents)
      .values(rows)
      .onConflictDoUpdate({
        target: [
          calendarEvents.organizationId,
          calendarEvents.calendarEntityId,
          calendarEvents.providerEventId,
        ],
        set: Object.fromEntries(
          updatedEventFields.map((field) => [field, excluded(calendarEvents[field])]),
        ),
      });

  const upserted = [...entityIds.values()];
  for (const ids of chunks(upserted))
    await db
      .delete(calendarEventAttendees)
      .where(
        and(
          eq(calendarEventAttendees.organizationId, organizationId),
          inArray(calendarEventAttendees.eventEntityId, ids),
        ),
      );
  const attendees = [...incoming.values()].flatMap((event) =>
    attendeeValues(organizationId, entityIds.get(event.providerEventId)!, event.attendees),
  );
  for (const rows of chunks(attendees)) await db.insert(calendarEventAttendees).values(rows);

  for (const ids of chunks([...new Set(result.cancelledEventIds)]))
    await db
      .update(calendarEvents)
      .set({ status: "cancelled", syncGeneration: generation })
      .where(and(ofCalendar, inArray(calendarEvents.providerEventId, ids)));

  // A full sync lists every event in the window, so older generations are gone at the provider.
  // Deleting the entity cascades to the event, its attendees, and its links.
  if (result.fullSync)
    await db.delete(entities).where(
      and(
        eq(entities.organizationId, organizationId),
        inArray(
          entities.entityId,
          db
            .select({ entityId: calendarEvents.entityId })
            .from(calendarEvents)
            .where(and(ofCalendar, lt(calendarEvents.syncGeneration, generation))),
        ),
      ),
    );

  calendarChanged(db, organizationId, calendarEntityId);
  return { committed: true };
}

/**
 * Stores one sync run's events and cursor in one transaction, if the claim's lease is still held.
 * A lost lease writes nothing and returns `committed: false`.
 */
export function commitCalendarSync(
  db: DatabaseExecutor,
  input: { claim: CalendarSyncClaim; result: ProviderSyncResult; now?: Date },
): Promise<Committed<{ committed: boolean }>> {
  return commit(db, (tx) => writeCalendarSync(tx, input));
}

async function writeCalendarSyncFailure(
  db: DatabaseExecutor,
  {
    claim,
    outcome,
    errorCode,
    now = new Date(),
  }: { claim: CalendarSyncClaim; outcome: CalendarSyncFailure; errorCode: string; now?: Date },
) {
  let change: Partial<typeof calendars.$inferInsert>;
  if (outcome === "retry")
    change = {
      syncStatus: "error",
      syncErrorCode: errorCode,
      nextSyncAt: new Date(now.getTime() + retryDelayMs),
    };
  else if (outcome === "reauth_required")
    change = { syncStatus: "reauth_required", syncErrorCode: errorCode, nextSyncAt: null };
  // An expired cursor is not an error the owner can act on: the next run is a full sync.
  else change = { syncStatus: "pending", syncCursor: null, syncErrorCode: null, nextSyncAt: now };
  change.syncLeaseToken = null;
  change.syncLeaseExpiresAt = null;
  const [row] = await db
    .update(calendars)
    .set(change)
    .where(leaseHeld(claim, now))
    .returning({ entityId: calendars.entityId });
  if (!row) return { committed: false };
  calendarChanged(db, claim.organizationId, claim.calendarEntityId);
  return { committed: true };
}

/** Records a failed sync run and releases its lease, if the lease is still held. */
export function failCalendarSync(
  db: DatabaseExecutor,
  input: { claim: CalendarSyncClaim; outcome: CalendarSyncFailure; errorCode: string; now?: Date },
): Promise<Committed<{ committed: boolean }>> {
  return commit(db, (tx) => writeCalendarSyncFailure(tx, input));
}
