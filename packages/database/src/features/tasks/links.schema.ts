import { taskLinkKinds } from "@substrate/contracts/tasks/links";

import { actors } from "../../core/actors/schema";
import { tasks } from "./tasks.schema";
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// `blocks` and `duplicates` point from source to target. `relates_to` has no direction, so it
// is stored once with the lower task id as the source.
export const taskLinks = pgTable(
  "task_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id").notNull(),
    sourceTaskEntityId: uuid("source_task_entity_id").notNull(),
    targetTaskEntityId: uuid("target_task_entity_id").notNull(),
    kind: text("kind", { enum: taskLinkKinds }).notNull(),
    createdByActorEntityId: uuid("created_by_actor_entity_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: "task_links_source_fk",
      columns: [table.organizationId, table.sourceTaskEntityId],
      foreignColumns: [tasks.organizationId, tasks.entityId],
    }).onDelete("cascade"),
    foreignKey({
      name: "task_links_target_fk",
      columns: [table.organizationId, table.targetTaskEntityId],
      foreignColumns: [tasks.organizationId, tasks.entityId],
    }).onDelete("cascade"),
    foreignKey({
      name: "task_links_creator_fk",
      columns: [table.organizationId, table.createdByActorEntityId],
      foreignColumns: [actors.organizationId, actors.entityId],
    }),
    unique("task_links_pair_unique").on(
      table.organizationId,
      table.sourceTaskEntityId,
      table.targetTaskEntityId,
      table.kind,
    ),
    check("task_links_kind_check", sql`${table.kind} IN ('blocks', 'relates_to', 'duplicates')`),
    check("task_links_self_check", sql`${table.sourceTaskEntityId} <> ${table.targetTaskEntityId}`),
    check(
      "task_links_relates_order_check",
      sql`${table.kind} <> 'relates_to' OR ${table.sourceTaskEntityId} < ${table.targetTaskEntityId}`,
    ),
    index("task_links_target_idx").on(table.organizationId, table.targetTaskEntityId),
  ],
);
