import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { entities } from "../../core/entities/schema";
import { entityIdentity } from "../../core/entities/identity";
import { entityAccessParents } from "../../core/permissions/access-parents";
import { calendars } from "./calendars.schema";

export const calendarEvents = pgTable(
  "calendar_events",
  {
    ...entityIdentity("calendar_event"),
    calendarEntityId: uuid("calendar_entity_id").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    location: text("location"),
    allDay: boolean("all_day").notNull(),
    timeZone: text("time_zone").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    startsOn: date("starts_on"),
    endsOn: date("ends_on"),
    recurrenceRule: text("recurrence_rule"),
    providerEventId: text("provider_event_id"),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.entityId, table.entityType],
      foreignColumns: [entities.organizationId, entities.entityId, entities.entityType],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.calendarEntityId],
      foreignColumns: [calendars.organizationId, calendars.entityId],
    }),
    foreignKey({
      columns: [table.organizationId, table.entityId, table.calendarEntityId],
      foreignColumns: [
        entityAccessParents.organizationId,
        entityAccessParents.entityId,
        entityAccessParents.parentEntityId,
      ],
    }),
    unique("calendar_events_calendar_entity_unique").on(
      table.organizationId,
      table.entityId,
      table.calendarEntityId,
    ),
    unique("calendar_events_provider_unique").on(table.calendarEntityId, table.providerEventId),
    index("calendar_events_calendar_idx").on(
      table.organizationId,
      table.calendarEntityId,
      table.entityId,
    ),
    check("calendar_events_title_check", sql`length(trim(${table.title})) > 0`),
    check("calendar_events_time_zone_check", sql`length(trim(${table.timeZone})) > 0`),
    check(
      "calendar_events_timing_check",
      sql`(
    ${table.allDay} AND ${table.startsOn} IS NOT NULL AND ${table.endsOn} IS NOT NULL AND ${table.endsOn} > ${table.startsOn} AND ${table.startsAt} IS NULL AND ${table.endsAt} IS NULL
  ) OR (
    NOT ${table.allDay} AND ${table.startsAt} IS NOT NULL AND ${table.endsAt} IS NOT NULL AND ${table.endsAt} > ${table.startsAt} AND ${table.startsOn} IS NULL AND ${table.endsOn} IS NULL
  )`,
    ),
  ],
);
