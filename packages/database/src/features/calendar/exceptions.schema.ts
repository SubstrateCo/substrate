import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { calendarEvents } from "./events.schema";

export const eventRecurrenceExceptions = pgTable(
  "event_recurrence_exceptions",
  {
    organizationId: text("organization_id").notNull(),
    eventEntityId: uuid("event_entity_id").notNull(),
    calendarEntityId: uuid("calendar_entity_id").notNull(),
    occurrenceKey: text("occurrence_key").notNull(),
    cancelled: boolean("cancelled").notNull(),
    replacementEventEntityId: uuid("replacement_event_entity_id"),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.eventEntityId, table.occurrenceKey] }),
    foreignKey({
      columns: [table.organizationId, table.eventEntityId, table.calendarEntityId],
      foreignColumns: [
        calendarEvents.organizationId,
        calendarEvents.entityId,
        calendarEvents.calendarEntityId,
      ],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.replacementEventEntityId, table.calendarEntityId],
      foreignColumns: [
        calendarEvents.organizationId,
        calendarEvents.entityId,
        calendarEvents.calendarEntityId,
      ],
    }),
    check("event_recurrence_exceptions_key_check", sql`length(trim(${table.occurrenceKey})) > 0`),
    check(
      "event_recurrence_exceptions_action_check",
      sql`(${table.cancelled} AND ${table.replacementEventEntityId} IS NULL) OR (NOT ${table.cancelled} AND ${table.replacementEventEntityId} IS NOT NULL AND ${table.replacementEventEntityId} <> ${table.eventEntityId})`,
    ),
  ],
);
