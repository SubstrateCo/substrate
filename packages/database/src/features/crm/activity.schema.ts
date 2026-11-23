import type { CrmActivityInput } from "@substrate/contracts/crm/activity";

import { actors } from "../../core/actors/schema";
import { entities, entityType } from "../../core/entities/schema";
import { organization } from "../../core/organizations/schema";
import { foreignKey, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const crmActivityEvents = pgTable(
  "crm_activity_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    entityId: uuid("entity_id").notNull(),
    entityType: entityType("entity_type").$type<"account" | "contact" | "deal">().notNull(),
    actorEntityId: uuid("actor_entity_id").notNull(),
    action: text("action").$type<CrmActivityInput["action"]>().notNull(),
    changedFields: jsonb("changed_fields")
      .$type<NonNullable<CrmActivityInput["changedFields"]>>()
      .default([])
      .notNull(),
    relatedEntityId: uuid("related_entity_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    foreignKey({
      name: "crm_activity_entity_fk",
      columns: [t.organizationId, t.entityId, t.entityType],
      foreignColumns: [entities.organizationId, entities.entityId, entities.entityType],
    }),
    foreignKey({
      name: "crm_activity_actor_fk",
      columns: [t.organizationId, t.actorEntityId],
      foreignColumns: [actors.organizationId, actors.entityId],
    }),
    foreignKey({
      name: "crm_activity_related_fk",
      columns: [t.organizationId, t.relatedEntityId],
      foreignColumns: [entities.organizationId, entities.entityId],
    }),
    index("crm_activity_page_idx").on(t.organizationId, t.entityId, t.createdAt, t.id),
  ],
);
