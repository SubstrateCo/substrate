import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { entities } from "../entities/schema";

export const entityAccessParents = pgTable(
  "entity_access_parents",
  {
    organizationId: text("organization_id").notNull(),
    entityId: uuid("entity_id").notNull(),
    parentEntityId: uuid("parent_entity_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.entityId] }),
    unique("entity_access_parents_path_unique").on(
      table.organizationId,
      table.entityId,
      table.parentEntityId,
    ),
    foreignKey({
      columns: [table.organizationId, table.entityId],
      foreignColumns: [entities.organizationId, entities.entityId],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.parentEntityId],
      foreignColumns: [entities.organizationId, entities.entityId],
    }),
    index("entity_access_parents_parent_idx").on(table.organizationId, table.parentEntityId),
    check(
      "entity_access_parents_no_self_parent",
      sql`${table.entityId} <> ${table.parentEntityId}`,
    ),
  ],
);
