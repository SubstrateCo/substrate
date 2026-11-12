import { actors } from "../actors/schema";
import { entities, entityType } from "../entities/schema";
import { contacts } from "./schema";
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const contactInteractionKind = pgEnum("contact_interaction_kind", [
  "email",
  "meeting",
  "call",
  "message",
  "note",
  "other",
]);
export const contactInteractionOrigin = pgEnum("contact_interaction_origin", [
  "manual",
  "imported",
  "message_publication",
]);

export const contactInteractions = pgTable(
  "contact_interactions",
  {
    entityId: uuid("entity_id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    // Check the type as text so enum expansion and table creation can share a migration transaction.
    entityType: entityType("entity_type").notNull(),
    contactEntityId: uuid("contact_entity_id").notNull(),
    kind: contactInteractionKind("kind").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    summary: text("summary").notNull(),
    origin: contactInteractionOrigin("origin").notNull(),
    sourceEntityId: uuid("source_entity_id"),
    sourceEntityType: entityType("source_entity_type"),
    createdByActorEntityId: uuid("created_by_actor_entity_id").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.entityId, table.entityType],
      foreignColumns: [entities.organizationId, entities.entityId, entities.entityType],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.contactEntityId],
      foreignColumns: [contacts.organizationId, contacts.entityId],
    }),
    foreignKey({
      columns: [table.organizationId, table.entityId, table.contactEntityId],
      foreignColumns: [entities.organizationId, entities.entityId, entities.accessEntityId],
    }),
    foreignKey({
      columns: [table.organizationId, table.sourceEntityId, table.sourceEntityType],
      foreignColumns: [entities.organizationId, entities.entityId, entities.entityType],
    }),
    foreignKey({
      columns: [table.organizationId, table.createdByActorEntityId],
      foreignColumns: [actors.organizationId, actors.entityId],
    }),
    check(
      "contact_interactions_type_check",
      sql`${table.entityType}::text = 'contact_interaction'`,
    ),
    check("contact_interactions_summary_check", sql`length(trim(${table.summary})) > 0`),
    check(
      "contact_interactions_time_check",
      sql`${table.endedAt} IS NULL OR ${table.endedAt} >= ${table.occurredAt}`,
    ),
    check(
      "contact_interactions_source_check",
      sql`(${table.origin}::text IN ('manual', 'message_publication') AND ${table.sourceEntityId} IS NULL AND ${table.sourceEntityType} IS NULL) OR (${table.origin}::text = 'imported' AND ${table.sourceEntityId} IS NOT NULL AND ${table.sourceEntityType} IS NOT NULL)`,
    ),
    check(
      "contact_interactions_no_self_source_check",
      sql`${table.sourceEntityId} IS NULL OR ${table.sourceEntityId} <> ${table.entityId}`,
    ),
    index("contact_interactions_timeline_idx").on(
      table.organizationId,
      table.contactEntityId,
      table.occurredAt.desc(),
      table.entityId.desc(),
    ),
    uniqueIndex("contact_interactions_source_unique")
      .on(table.organizationId, table.contactEntityId, table.sourceEntityId)
      .where(sql`${table.origin} = 'imported'`),
    index("contact_interactions_source_idx").on(table.organizationId, table.sourceEntityId),
    unique("contact_interactions_org_entity_contact_unique").on(
      table.organizationId,
      table.entityId,
      table.contactEntityId,
    ),
  ],
);
