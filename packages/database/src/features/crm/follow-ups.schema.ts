import { actors } from "../../core/actors/schema";
import { entities } from "../../core/entities/schema";
import { organization } from "../../core/organizations/schema";
import { tasks } from "../tasks/tasks.schema";
import { pgTable, text, uuid, foreignKey, primaryKey, timestamp } from "drizzle-orm/pg-core";

export const crmFollowUpSources = pgTable(
  "crm_follow_up_sources",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    actorEntityId: uuid("actor_entity_id").notNull(),
    requestId: uuid("request_id").notNull(),
    fingerprint: text("fingerprint").notNull(),
    sourceEntityId: uuid("source_entity_id").notNull(),
    taskEntityId: uuid("task_entity_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.actorEntityId, t.requestId] }),
    foreignKey({
      name: "crm_followup_actor_fk",
      columns: [t.organizationId, t.actorEntityId],
      foreignColumns: [actors.organizationId, actors.entityId],
    }),
    foreignKey({
      name: "crm_followup_source_fk",
      columns: [t.organizationId, t.sourceEntityId],
      foreignColumns: [entities.organizationId, entities.entityId],
    }),
    foreignKey({
      name: "crm_followup_task_fk",
      columns: [t.organizationId, t.taskEntityId],
      foreignColumns: [tasks.organizationId, tasks.entityId],
    }),
  ],
);
