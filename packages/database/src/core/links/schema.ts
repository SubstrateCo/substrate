import { actors } from "../actors/schema";
import { entities } from "../entities/schema";
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const relationType = pgEnum("relation_type", ["related_to", "mentions"]);

export const entityLinks = pgTable(
  "entity_links",
  {
    organizationId: text("organization_id").notNull(),
    sourceEntityId: uuid("source_entity_id").notNull(),
    targetEntityId: uuid("target_entity_id").notNull(),
    relationType: relationType("relation_type").notNull(),
    createdByActorEntityId: uuid("created_by_actor_entity_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.organizationId,
        table.sourceEntityId,
        table.targetEntityId,
        table.relationType,
      ],
    }),
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
    check("entity_links_no_self_link", sql`${table.sourceEntityId} <> ${table.targetEntityId}`),
  ],
);
