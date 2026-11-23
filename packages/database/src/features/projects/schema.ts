import { actors } from "../../core/actors/schema";
import { entityIdentity } from "../../core/entities/identity";
import { entities } from "../../core/entities/schema";
import { searchDocument, trigramKey } from "../../core/search/indexing";
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const projects = pgTable(
  "projects",
  {
    ...entityIdentity("project"),
    name: text("name").notNull(),
    description: text("description").default("").notNull(),
    image: text("image"),
    // An archived project and its tasks are read-only until restored.
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedByActorEntityId: uuid("archived_by_actor_entity_id"),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.entityId, table.entityType],
      foreignColumns: [entities.organizationId, entities.entityId, entities.entityType],
    }).onDelete("cascade"),
    unique("projects_organization_entity_unique").on(table.organizationId, table.entityId),
    foreignKey({
      columns: [table.organizationId, table.archivedByActorEntityId],
      foreignColumns: [actors.organizationId, actors.entityId],
    }),
    check("projects_name_check", sql`length(trim(${table.name})) BETWEEN 1 AND 200`),
    check(
      "projects_archive_check",
      sql`(${table.archivedAt} IS NULL) = (${table.archivedByActorEntityId} IS NULL)`,
    ),
    check(
      "projects_image_check",
      sql`${table.image} IS NULL OR ${table.image} ~ ('^/api/v1/files/pictures/project-icon/' || ${table.entityId}::text || '[?]v=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')`,
    ),
    index("projects_search_idx").using("gin", searchDocument(table.name, table.description)),
    index("projects_name_trgm_idx").using("gin", sql`${trigramKey(table.name)} gin_trgm_ops`),
  ],
);
