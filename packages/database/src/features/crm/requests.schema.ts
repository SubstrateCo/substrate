import { actors } from "../../core/actors/schema";
import { entities } from "../../core/entities/schema";
import { organization } from "../../core/organizations/schema";
import { sql } from "drizzle-orm";
import { pgTable, text, uuid, foreignKey, primaryKey, check } from "drizzle-orm/pg-core";

export const crmCreateRequests = pgTable(
  "crm_create_requests",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    actorEntityId: uuid("actor_entity_id").notNull(),
    operation: text("operation").notNull(),
    requestId: uuid("request_id").notNull(),
    fingerprint: text("fingerprint").notNull(),
    entityId: uuid("entity_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.actorEntityId, t.operation, t.requestId] }),
    foreignKey({
      name: "crm_create_request_actor_fk",
      columns: [t.organizationId, t.actorEntityId],
      foreignColumns: [actors.organizationId, actors.entityId],
    }),
    foreignKey({
      name: "crm_create_request_entity_fk",
      columns: [t.organizationId, t.entityId],
      foreignColumns: [entities.organizationId, entities.entityId],
    }),
    check(
      "crm_create_request_operation",
      sql`${t.operation} in ('account', 'deal', 'from_message')`,
    ),
  ],
);
