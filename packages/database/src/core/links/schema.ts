import { actors } from "../actors/schema";
import { entities } from "../entities/schema";
import { idColumn } from "../ids";
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const relationTypes = ["related_to", "blocks", "duplicates"] as const;
export const relationType = pgEnum("relation_type", relationTypes);

export const entityLinks = pgTable(
  "entity_links",
  {
    id: idColumn(),
    organizationId: text("organization_id").notNull(),
    sourceEntityId: uuid("source_entity_id").notNull(),
    targetEntityId: uuid("target_entity_id").notNull(),
    relationType: relationType("relation_type").notNull(),
    createdByActorEntityId: uuid("created_by_actor_entity_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("entity_links_pair_unique").on(
      table.organizationId,
      table.sourceEntityId,
      table.targetEntityId,
      table.relationType,
    ),
    foreignKey({
      columns: [table.organizationId, table.sourceEntityId],
      foreignColumns: [entities.organizationId, entities.entityId],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.targetEntityId],
      foreignColumns: [entities.organizationId, entities.entityId],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.createdByActorEntityId],
      foreignColumns: [actors.organizationId, actors.entityId],
    }),
    index("entity_links_target_idx").on(table.organizationId, table.targetEntityId),
    uniqueIndex("entity_links_directed_pair_unique")
      .on(
        table.organizationId,
        table.relationType,
        sql`least(${table.sourceEntityId}, ${table.targetEntityId})`,
        sql`greatest(${table.sourceEntityId}, ${table.targetEntityId})`,
      )
      .where(sql`${table.relationType} IN ('blocks', 'duplicates')`),
    check("entity_links_no_self_link", sql`${table.sourceEntityId} <> ${table.targetEntityId}`),
    check(
      "entity_links_related_order",
      sql`${table.relationType}::text <> 'related_to' OR ${table.sourceEntityId} < ${table.targetEntityId}`,
    ),
  ],
);
