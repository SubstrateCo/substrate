import { activeActorCondition } from "../../core/actors/access";
import { actors } from "../../core/actors/schema";
import { user } from "../../core/authentication/schema";
import { entities } from "../../core/entities/schema";
import type { DatabaseExecutor } from "../../core/executor";
import { appEnabledCondition } from "../../core/permissions/app-visibility";
import { calendarEvents, calendars } from "./schema";
import { and, asc, eq, gte, lte, sql, type SQLWrapper } from "drizzle-orm";

function liveEntity(organizationId: SQLWrapper, entityId: SQLWrapper) {
  return sql`EXISTS (
    SELECT 1 FROM ${entities} completion_entity
    WHERE completion_entity.organization_id = ${organizationId}
      AND completion_entity.entity_id = ${entityId} AND completion_entity.deleted_at IS NULL
  )`;
}

/**
 * The calendar gates of an event in `calendar_events` joined to its `calendars` row: the owner
 * consents, the meeting ends after the consent start, both records are live, the calendar app is
 * enabled, and the owner is a verified, active member. Sync status does not matter.
 */
export function completionGates() {
  return and(
    eq(calendars.recordsInteractions, true),
    gte(calendarEvents.endsAt, calendars.interactionsFrom),
    liveEntity(calendars.organizationId, calendars.entityId),
    liveEntity(calendarEvents.organizationId, calendarEvents.entityId),
    appEnabledCondition(calendarEvents.organizationId, "calendar"),
    sql`EXISTS (
      SELECT 1 FROM ${actors}
      JOIN ${user} ON ${user.id} = ${actors.userId} AND ${user.emailVerified}
      WHERE ${actors.organizationId} = ${calendars.organizationId}
        AND ${actors.entityId} = ${calendars.ownerActorEntityId}
        AND ${activeActorCondition()}
        AND ${liveEntity(actors.organizationId, actors.entityId)}
    )`,
  );
}

/** Ended meetings not yet processed, oldest end first. The first condition is the predicate of
 * `calendar_events_completion_idx`, so the planner can use that index. */
export function endedMeetingsQuery(db: DatabaseExecutor, limit: number, now: Date) {
  return db
    .select({
      organizationId: calendarEvents.organizationId,
      eventEntityId: calendarEvents.entityId,
    })
    .from(calendarEvents)
    .innerJoin(
      calendars,
      and(
        eq(calendars.organizationId, calendarEvents.organizationId),
        eq(calendars.entityId, calendarEvents.calendarEntityId),
      ),
    )
    .where(
      and(
        // Literals, not parameters, so that a generic plan still matches the index predicate.
        sql`${calendarEvents.interactionsRecordedAt} IS NULL AND ${calendarEvents.kind} = 'default' AND ${calendarEvents.status} <> 'cancelled'`,
        lte(calendarEvents.endsAt, now),
        completionGates(),
      ),
    )
    .orderBy(asc(calendarEvents.endsAt))
    .limit(limit);
}
