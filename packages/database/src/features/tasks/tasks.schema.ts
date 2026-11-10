import { taskStatusValues } from "@startup-os/contracts/tasks";

import { actors } from "../../core/actors/schema";
import { entityIdentity } from "../../core/entities/identity";
import { entities } from "../../core/entities/schema";
import { entityAccessParents } from "../../core/permissions/access-parents";
import { searchDocument, trigramKey } from "../../core/search/indexing";
import { projects } from "../projects/schema";
import { sql } from "drizzle-orm";
import { check, date, foreignKey, index, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";

export const tasks = pgTable(
  "tasks",
  {
    ...entityIdentity("task"),
    projectEntityId: uuid("project_entity_id").notNull(),
    parentTaskEntityId: uuid("parent_task_entity_id"),
    title: text("title").notNull(),
    description: text("description").default("").notNull(),
    status: text("status", { enum: taskStatusValues }).default("not_started").notNull(),
    priority: text("priority")
      .$type<"none" | "low" | "medium" | "high" | "urgent">()
      .default("none")
      .notNull(),
    assigneeActorEntityId: uuid("assignee_actor_entity_id"),
    dueDate: date("due_date"),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.entityId, table.entityType],
      foreignColumns: [entities.organizationId, entities.entityId, entities.entityType],
    }).onDelete("cascade"),
    unique("tasks_organization_entity_unique").on(table.organizationId, table.entityId),
    unique("tasks_project_entity_unique").on(
      table.organizationId,
      table.projectEntityId,
      table.entityId,
    ),
    foreignKey({
      columns: [table.organizationId, table.projectEntityId],
      foreignColumns: [projects.organizationId, projects.entityId],
    }),
    foreignKey({
      columns: [table.organizationId, table.entityId, table.projectEntityId],
      foreignColumns: [
        entityAccessParents.organizationId,
        entityAccessParents.entityId,
        entityAccessParents.parentEntityId,
      ],
    }),
    foreignKey({
      columns: [table.organizationId, table.projectEntityId, table.parentTaskEntityId],
      foreignColumns: [table.organizationId, table.projectEntityId, table.entityId],
    }),
    foreignKey({
      columns: [table.organizationId, table.assigneeActorEntityId],
      foreignColumns: [actors.organizationId, actors.entityId],
    }),
    check("tasks_title_check", sql`length(trim(${table.title})) BETWEEN 1 AND 300`),
    check(
      "tasks_status_check",
      sql`${table.status} IN ('not_started', 'in_progress', 'in_review', 'completed', 'canceled')`,
    ),
    check(
      "tasks_priority_check",
      sql`${table.priority} IN ('none', 'low', 'medium', 'high', 'urgent')`,
    ),
    check("tasks_parent_check", sql`${table.entityId} <> ${table.parentTaskEntityId}`),
    index("tasks_search_idx").using("gin", searchDocument(table.title, table.description)),
    index("tasks_title_trgm_idx").using("gin", sql`${trigramKey(table.title)} gin_trgm_ops`),
  ],
);
