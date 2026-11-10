import { entityIdentity } from "../../core/entities/identity";
import { entities } from "../../core/entities/schema";
import { searchDocument, trigramKey } from "../../core/search/indexing";
import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgTable, text, unique } from "drizzle-orm/pg-core";

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
    index("projects_search_idx").using("gin", searchDocument(table.name, table.description)),
    index("projects_name_trgm_idx").using("gin", sql`${trigramKey(table.name)} gin_trgm_ops`),
  ],
);
