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
] as const;
export type RequestOperation = (typeof requestOperations)[number];

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
