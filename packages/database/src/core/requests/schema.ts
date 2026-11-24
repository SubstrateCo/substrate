import { actors } from "../actors/schema";
import { entities } from "../entities/schema";
import { organization } from "../organizations/schema";
import { foreignKey, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const requestOperations = [
  "account",
  "deal",
  "deal_transition",
  "crm_from_message",
  "crm_follow_up",
  "task_from_message",
  "meeting",
] as const;
export type RequestOperation = (typeof requestOperations)[number];

// One row per retried write: the actor's request ID, a fingerprint of its input, and the entity it
// created or changed. Retries return that entity; a different input under the same ID conflicts.
export const idempotentRequests = pgTable(
  "idempotent_requests",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    actorEntityId: uuid("actor_entity_id").notNull(),
    operation: text("operation").$type<RequestOperation>().notNull(),
    requestId: uuid("request_id").notNull(),
    fingerprint: text("fingerprint").notNull(),
    // NULL only inside the transaction that claimed the request and has not recorded it yet.
    entityId: uuid("entity_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.actorEntityId, t.operation, t.requestId] }),
    foreignKey({
      name: "idempotent_request_actor_fk",
      columns: [t.organizationId, t.actorEntityId],
      foreignColumns: [actors.organizationId, actors.entityId],
    }),
    foreignKey({
      name: "idempotent_request_entity_fk",
      columns: [t.organizationId, t.entityId],
      foreignColumns: [entities.organizationId, entities.entityId],
    }),
  ],
);
