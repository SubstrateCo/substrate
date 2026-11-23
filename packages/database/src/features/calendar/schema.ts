import {
  attendeeResponseStatuses,
  calendarEventKinds,
  calendarEventStatuses,
  calendarEventVisibilities,
  calendarProviders,
  calendarSyncStatuses,
  type AttendeeResponseStatus,
  type CalendarEventKind,
  type CalendarEventStatus,
  type CalendarEventVisibility,
  type CalendarProvider,
  type CalendarSyncStatus,
} from "@substrate/contracts/calendar";

import { actors } from "../../core/actors/schema";
import { account } from "../../core/authentication/schema";
import { entities, entityType } from "../../core/entities/schema";
import { sql, type SQLWrapper } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

function oneOf(column: SQLWrapper, values: readonly string[]) {
  return sql`${column} IN (${sql.raw(values.map((value) => `'${value}'`).join(", "))})`;
}

// One row per organization, owner, and provider calendar. Connection and sync state live here.
// Calendars are personal: only the owner's grant reaches them, and admins get no access.
export const calendars = pgTable(
  "calendars",
  {
    entityId: uuid("entity_id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    // Checked as text so enum expansion and table creation can share a migration transaction.
    entityType: entityType("entity_type").notNull(),
    ownerActorEntityId: uuid("owner_actor_entity_id").notNull(),
    ownerUserId: text("owner_user_id").notNull(),
    provider: text("provider").$type<CalendarProvider>().notNull(),
    // The linked provider account. Unlinking it keeps the calendar and its history, disconnected.
    // The repository checks that the account belongs to the owner.
    credentialAccountId: text("credential_account_id").references(() => account.id, {
      onDelete: "set null",
    }),
    providerCalendarId: text("provider_calendar_id").notNull(),
    name: text("name").notNull(),
    color: text("color"),
    timeZone: text("time_zone"),
    isPrimary: boolean("is_primary").default(false).notNull(),
    // Owner consent to create contacts and organization-visible interactions from meetings.
    recordsInteractions: boolean("records_interactions").default(false).notNull(),
    // Only meetings that end at or after this time create interactions.
    interactionsFrom: timestamp("interactions_from", { withTimezone: true }).notNull(),
    // A full sync fetches events from this time.
    syncWindowStart: timestamp("sync_window_start", { withTimezone: true }).notNull(),
    syncStatus: text("sync_status").$type<CalendarSyncStatus>().default("pending").notNull(),
    // Google `syncToken` or Microsoft Graph `deltaLink`. Null forces a full sync.
    syncCursor: text("sync_cursor"),
    // Each full sync increments it; events left on an older generation are gone at the provider.
    syncGeneration: integer("sync_generation").default(0).notNull(),
    nextSyncAt: timestamp("next_sync_at", { withTimezone: true }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    syncErrorCode: text("sync_error_code"),
    syncLeaseToken: uuid("sync_lease_token"),
    syncLeaseExpiresAt: timestamp("sync_lease_expires_at", { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.entityId, table.entityType],
      foreignColumns: [entities.organizationId, entities.entityId, entities.entityType],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.ownerActorEntityId, table.ownerUserId],
      foreignColumns: [actors.organizationId, actors.entityId, actors.userId],
    }),
    unique("calendars_organization_entity_unique").on(table.organizationId, table.entityId),
    unique("calendars_owner_calendar_unique").on(
      table.organizationId,
      table.ownerActorEntityId,
      table.provider,
      table.providerCalendarId,
    ),
    check("calendars_type_check", sql`${table.entityType}::text = 'calendar'`),
    check("calendars_provider_check", oneOf(table.provider, calendarProviders)),
    check("calendars_sync_status_check", oneOf(table.syncStatus, calendarSyncStatuses)),
    check("calendars_name_check", sql`length(trim(${table.name})) BETWEEN 1 AND 500`),
    // A NULL credential means the provider account was unlinked. Reads then treat the calendar
    // as disconnected, whatever its stored status, and the sync worker never claims it.
    check(
      "calendars_lease_check",
      sql`(${table.syncLeaseToken} IS NULL) = (${table.syncLeaseExpiresAt} IS NULL)`,
    ),
    // The sync worker claims due calendars across organizations.
    index("calendars_due_idx")
      .on(table.nextSyncAt)
      .where(sql`${table.syncStatus} IN ('pending', 'active', 'error')`),
  ],
);

// One event occurrence. Its calendar is its access container.
export const calendarEvents = pgTable(
  "calendar_events",
  {
    entityId: uuid("entity_id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    entityType: entityType("entity_type").notNull(),
    calendarEntityId: uuid("calendar_entity_id").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    icalUid: text("ical_uid"),
    recurringEventId: text("recurring_event_id"),
    kind: text("kind").$type<CalendarEventKind>().notNull(),
    status: text("status").$type<CalendarEventStatus>().notNull(),
    title: text("title").default("").notNull(),
    description: text("description"),
    location: text("location"),
    conferenceUrl: text("conference_url"),
    htmlLink: text("html_link"),
    visibility: text("visibility").$type<CalendarEventVisibility>().default("default").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    allDay: boolean("all_day").default(false).notNull(),
    timeZone: text("time_zone"),
    providerUpdatedAt: timestamp("provider_updated_at", { withTimezone: true }),
    syncGeneration: integer("sync_generation").notNull(),
    // Set once the completion step has processed the meeting.
    interactionsRecordedAt: timestamp("interactions_recorded_at", { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.entityId, table.entityType],
      foreignColumns: [entities.organizationId, entities.entityId, entities.entityType],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.calendarEntityId],
      foreignColumns: [calendars.organizationId, calendars.entityId],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.entityId, table.calendarEntityId],
      foreignColumns: [entities.organizationId, entities.entityId, entities.accessEntityId],
    }),
    unique("calendar_events_organization_entity_unique").on(table.organizationId, table.entityId),
    unique("calendar_events_provider_unique").on(
      table.organizationId,
      table.calendarEntityId,
      table.providerEventId,
    ),
    check("calendar_events_type_check", sql`${table.entityType}::text = 'calendar_event'`),
    check("calendar_events_kind_check", oneOf(table.kind, calendarEventKinds)),
    check("calendar_events_status_check", oneOf(table.status, calendarEventStatuses)),
    check("calendar_events_visibility_check", oneOf(table.visibility, calendarEventVisibilities)),
    check("calendar_events_time_check", sql`${table.endsAt} >= ${table.startsAt}`),
    // Agenda views read a calendar's events by start time.
    index("calendar_events_agenda_idx").on(
      table.organizationId,
      table.calendarEntityId,
      table.startsAt,
    ),
    // The completion worker claims ended meetings that it has not processed.
    index("calendar_events_completion_idx")
      .on(table.endsAt)
      .where(
        sql`${table.interactionsRecordedAt} IS NULL AND ${table.kind} = 'default' AND ${table.status} <> 'cancelled'`,
      ),
  ],
);

// Attendees are matched to contacts by email when read, not stored as references.
export const calendarEventAttendees = pgTable(
  "calendar_event_attendees",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id").notNull(),
    eventEntityId: uuid("event_entity_id").notNull(),
    email: text("email").notNull(),
    normalizedEmail: text("normalized_email").notNull(),
    displayName: text("display_name"),
    responseStatus: text("response_status").$type<AttendeeResponseStatus>().notNull(),
    isOrganizer: boolean("is_organizer").default(false).notNull(),
    isSelf: boolean("is_self").default(false).notNull(),
    isOptional: boolean("is_optional").default(false).notNull(),
    isResource: boolean("is_resource").default(false).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.eventEntityId],
      foreignColumns: [calendarEvents.organizationId, calendarEvents.entityId],
    }).onDelete("cascade"),
    unique("calendar_event_attendees_email_unique").on(
      table.organizationId,
      table.eventEntityId,
      table.normalizedEmail,
    ),
    check(
      "calendar_event_attendees_response_check",
      oneOf(table.responseStatus, attendeeResponseStatuses),
    ),
    check("calendar_event_attendees_email_check", sql`length(trim(${table.normalizedEmail})) > 0`),
    // A contact's meetings are found by its email identifiers.
    index("calendar_event_attendees_email_idx").on(table.organizationId, table.normalizedEmail),
  ],
);
