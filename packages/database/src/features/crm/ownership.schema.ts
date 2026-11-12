import { actors } from "../../core/actors/schema";
import { entities, entityType } from "../../core/entities/schema";
import { organization } from "../../core/organizations/schema";
import { sql } from "drizzle-orm";
import { pgTable, text, uuid, timestamp, foreignKey, check } from "drizzle-orm/pg-core";

export const crmOwnerEvents = pgTable(
  "crm_owner_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    entityId: uuid("entity_id").notNull(),
    entityType: entityType("entity_type").notNull(),
    actorEntityId: uuid("actor_entity_id").notNull(),
    fromActorEntityId: uuid("from_actor_entity_id").notNull(),
    toActorEntityId: uuid("to_actor_entity_id").notNull(),
    accessDecision: text("access_decision").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    foreignKey({
      name: "crm_owner_event_entity_fk",
      columns: [t.organizationId, t.entityId, t.entityType],
      foreignColumns: [entities.organizationId, entities.entityId, entities.entityType],
    }),
    foreignKey({
      name: "crm_owner_event_actor_fk",
      columns: [t.organizationId, t.actorEntityId],
      foreignColumns: [actors.organizationId, actors.entityId],
    }),
    foreignKey({
      name: "crm_owner_event_from_fk",
      columns: [t.organizationId, t.fromActorEntityId],
      foreignColumns: [actors.organizationId, actors.entityId],
    }),
    foreignKey({
      name: "crm_owner_event_to_fk",
      columns: [t.organizationId, t.toActorEntityId],
      foreignColumns: [actors.organizationId, actors.entityId],
    }),
    check("crm_owner_event_type", sql`${t.entityType}::text in ('account', 'deal')`),
    check(
      "crm_owner_event_access_decision",
      sql`${t.accessDecision} in ('require_existing_access', 'keep_restricted')`,
    ),
  ],
);
