import { sql } from "drizzle-orm";
import { check, foreignKey, pgTable, text, unique } from "drizzle-orm/pg-core";
import { entities } from "../../core/entities/schema";
import { entityIdentity } from "../../core/entities/identity";

export const calendars = pgTable(
  "calendars",
  {
    ...entityIdentity("calendar"),
    name: text("name").notNull(),
    timeZone: text("time_zone").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.entityId, table.entityType],
      foreignColumns: [entities.organizationId, entities.entityId, entities.entityType],
    }).onDelete("cascade"),
    unique("calendars_organization_entity_unique").on(table.organizationId, table.entityId),
    check("calendars_name_check", sql`length(trim(${table.name})) > 0`),
    check("calendars_time_zone_check", sql`length(trim(${table.timeZone})) > 0`),
  ],
);
