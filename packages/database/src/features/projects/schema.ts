import { entityIdentity } from "../../core/entities/identity";
import { entities } from "../../core/entities/schema";
import { sql } from "drizzle-orm";
import { check, foreignKey, pgTable, text, unique } from "drizzle-orm/pg-core";

export const projects = pgTable(
  "projects",
  {
    ...entityIdentity("project"),
    name: text("name").notNull(),
    description: text("description").default("").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.entityId, table.entityType],
      foreignColumns: [entities.organizationId, entities.entityId, entities.entityType],
    }).onDelete("cascade"),
    unique("projects_organization_entity_unique").on(table.organizationId, table.entityId),
    check("projects_name_check", sql`length(trim(${table.name})) BETWEEN 1 AND 200`),
  ],
);
