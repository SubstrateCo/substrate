import { actors } from "../../core/actors/schema";
import { tasks } from "./tasks.schema";
import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const taskComments = pgTable(
  "task_comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id").notNull(),
    taskEntityId: uuid("task_entity_id").notNull(),
    authorActorEntityId: uuid("author_actor_entity_id").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.taskEntityId],
      foreignColumns: [tasks.organizationId, tasks.entityId],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.authorActorEntityId],
      foreignColumns: [actors.organizationId, actors.entityId],
    }),
    check("task_comments_body_check", sql`length(trim(${table.body})) BETWEEN 1 AND 20000`),
    index("task_comments_timeline_idx").on(
      table.organizationId,
      table.taskEntityId,
      table.createdAt,
      table.id,
    ),
  ],
);
