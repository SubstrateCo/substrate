import { sql } from "drizzle-orm";
import { check, foreignKey, integer, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { entityIdentity } from "../../core/entities/identity";
import { entities } from "../../core/entities/schema";

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

export const projectStatuses = pgTable(
  "project_statuses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id").notNull(),
    projectEntityId: uuid("project_entity_id").notNull(),
    name: text("name").notNull(),
    category: text("category").$type<"todo" | "active" | "done" | "canceled">().notNull(),
    position: integer("position").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.projectEntityId],
      foreignColumns: [projects.organizationId, projects.entityId],
    }).onDelete("cascade"),
    unique("project_statuses_project_id_unique").on(
      table.organizationId,
      table.projectEntityId,
      table.id,
    ),
    unique("project_statuses_name_unique").on(table.projectEntityId, table.name),
    check("project_statuses_name_check", sql`length(trim(${table.name})) BETWEEN 1 AND 100`),
    check(
      "project_statuses_category_check",
      sql`${table.category} IN ('todo', 'active', 'done', 'canceled')`,
    ),
  ],
);
