import { entities, entityType } from "../../core/entities/schema";
import { taskComments } from "./comments.schema";
import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";

// Tasks and projects that a comment references. Derived from the comment body when it is saved.
export const taskCommentReferences = pgTable(
  "task_comment_references",
  {
    commentId: uuid("comment_id")
      .notNull()
      .references(() => taskComments.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").notNull(),
    entityId: uuid("entity_id").notNull(),
    entityType: entityType("entity_type").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.commentId, table.entityId] }),
    foreignKey({
      name: "task_comment_references_entity_fk",
      columns: [table.organizationId, table.entityId, table.entityType],
      foreignColumns: [entities.organizationId, entities.entityId, entities.entityType],
    }).onDelete("cascade"),
    check("task_comment_references_type_check", sql`${table.entityType} IN ('task', 'project')`),
    index("task_comment_references_target_idx").on(table.organizationId, table.entityId),
  ],
);
