import {
  crmActivityActions,
  crmActivityFields,
  type CrmActivityInput,
} from "@substrate/contracts/crm/activity";

import { actors } from "../../core/actors/schema";
import { entities, entityType } from "../../core/entities/schema";
import { organization } from "../../core/organizations/schema";
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const crmActivityEvents = pgTable(
  "crm_activity_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    entityId: uuid("entity_id").notNull(),
    entityType: entityType("entity_type").notNull(),
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
    check("crm_activity_entity_type", sql`${t.entityType}::text in ('account', 'contact', 'deal')`),
    check(
      "crm_activity_action",
      sql`${t.action} in (${sql.join(
        crmActivityActions.map((action) => sql.raw(`'${action.replaceAll("'", "''")}'`)),
        sql`, `,
      )})`,
    ),
    check(
      "crm_activity_fields",
      sql`jsonb_typeof(${t.changedFields}) = 'array' and ${t.changedFields} <@ ${sql.raw(`'${JSON.stringify(crmActivityFields).replaceAll("'", "''")}'::jsonb`)}`,
    ),
    index("crm_activity_page_idx").on(t.organizationId, t.entityId, t.createdAt, t.id),
  ],
);
