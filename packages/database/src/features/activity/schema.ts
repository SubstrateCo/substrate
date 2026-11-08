import { actors } from "../../core/actors/schema";
import { messagingMessages } from "../messaging/schema";
import { tasks } from "../tasks/tasks.schema";
import { sql } from "drizzle-orm";
import { foreignKey, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const taskActivity = pgTable(
  "task_activity",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id").notNull(),
    taskEntityId: uuid("task_entity_id").notNull(),
    actorEntityId: uuid("actor_entity_id").notNull(),
    action: text("action").notNull(),
    // Task history outlives a deleted conversation. The row stays without its message link.
    sourceMessageId: uuid("source_message_id").references(() => messagingMessages.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.taskEntityId],
      foreignColumns: [tasks.organizationId, tasks.entityId],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.actorEntityId],
      foreignColumns: [actors.organizationId, actors.entityId],
    }),
    index("task_activity_timeline_idx").on(
      table.organizationId,
      table.taskEntityId,
      table.createdAt,
      table.id,
    ),
    // Message deletion clears the link here.
    index("task_activity_source_message_idx")
      .on(table.sourceMessageId)
      .where(sql`${table.sourceMessageId} IS NOT NULL`),
  ],
);
