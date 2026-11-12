import type { TaskStatus } from "@substrate/contracts/tasks";
import {
  inverseTaskLinkRelation,
  taskLinkRelation,
  taskLinkRelationLabels,
  type TaskLinkKind,
  type TaskLinkRelation,
  type TaskLinkView,
} from "@substrate/contracts/tasks/links";

import { entities } from "../../core/entities/schema";
import type { Locked, RepositoryContext } from "../../core/repository-context";
import { AccessDeniedError, ValidationError } from "../../errors";
import { recordTaskActivity } from "../activity/events";
import { projects } from "../projects/schema";
import { taskLinks } from "./links.schema";
import { tasks } from "./tasks.schema";
import { and, eq, or, sql, type SQL } from "drizzle-orm";

type Task = typeof tasks.$inferSelect;

function stored(taskEntityId: string, otherEntityId: string, relation: TaskLinkRelation) {
  const forward = { sourceTaskEntityId: taskEntityId, targetTaskEntityId: otherEntityId };
  const backward = { sourceTaskEntityId: otherEntityId, targetTaskEntityId: taskEntityId };
  switch (relation) {
    case "blocks":
      return { kind: "blocks" as const, ...forward };
    case "blocked_by":
      return { kind: "blocks" as const, ...backward };
    case "duplicates":
      return { kind: "duplicates" as const, ...forward };
    case "duplicated_by":
      return { kind: "duplicates" as const, ...backward };
    case "relates_to":
      return {
        kind: "relates_to" as const,
        ...(taskEntityId < otherEntityId ? forward : backward),
      };
    default:
      throw new ValidationError("Select a standard link type.");
  }
}

export type TaskLinkRow = {
  id: string;
  kind: TaskLinkKind;
  createdAt: unknown;
  sourceId: string;
  sourceTitle: string;
  sourceStatus: TaskStatus;
  sourceProjectId: string;
  sourceProjectName: string;
  sourceReadable: boolean;
  targetId: string;
  targetTitle: string;
  targetStatus: TaskStatus;
  targetProjectId: string;
  targetProjectName: string;
  targetReadable: boolean;
};

// Links that match `where`, with both tasks and their projects live, in no order. Order by
// "createdAt", then id.
function linkRows(ctx: RepositoryContext, where: SQL) {
  return sql`
    SELECT link.id, link.kind, link.created_at AS "createdAt",
      src.entity_id AS "sourceId", src.title AS "sourceTitle", src.status AS "sourceStatus",
      src.project_entity_id AS "sourceProjectId", src_project.name AS "sourceProjectName",
      ${ctx.readable(sql`src.entity_id`)} AS "sourceReadable",
      tgt.entity_id AS "targetId", tgt.title AS "targetTitle", tgt.status AS "targetStatus",
      tgt.project_entity_id AS "targetProjectId", tgt_project.name AS "targetProjectName",
      ${ctx.readable(sql`tgt.entity_id`)} AS "targetReadable"
    FROM ${taskLinks} link
    JOIN ${tasks} src ON src.organization_id = link.organization_id
      AND src.entity_id = link.source_task_entity_id
    JOIN ${tasks} tgt ON tgt.organization_id = link.organization_id
      AND tgt.entity_id = link.target_task_entity_id
    JOIN ${projects} src_project ON src_project.organization_id = src.organization_id
      AND src_project.entity_id = src.project_entity_id
    JOIN ${projects} tgt_project ON tgt_project.organization_id = tgt.organization_id
      AND tgt_project.entity_id = tgt.project_entity_id
    WHERE link.organization_id = ${ctx.scope.organizationId} AND ${where}
      AND NOT EXISTS (
        SELECT 1 FROM ${entities} gone
        WHERE gone.organization_id = link.organization_id AND gone.deleted_at IS NOT NULL
          AND gone.entity_id IN (
            src.entity_id, tgt.entity_id, src.project_entity_id, tgt.project_entity_id
          )
      )
  `;
}

// An end the reader cannot open keeps its place in the link but loses every field.
export function toLinkView(row: TaskLinkRow): TaskLinkView {
  return {
    id: row.id,
    kind: row.kind,
    source: row.sourceReadable
      ? {
          entityId: row.sourceId,
          title: row.sourceTitle,
          status: row.sourceStatus,
          projectEntityId: row.sourceProjectId,
          projectName: row.sourceProjectName,
        }
      : null,
    target: row.targetReadable
      ? {
          entityId: row.targetId,
          title: row.targetTitle,
          status: row.targetStatus,
          projectEntityId: row.targetProjectId,
          projectName: row.targetProjectName,
        }
      : null,
    blocking:
      row.kind === "blocks" && row.sourceStatus !== "completed" && row.sourceStatus !== "canceled",
  };
}

async function linkViews(ctx: RepositoryContext, where: SQL): Promise<TaskLinkView[]> {
  const rows = await ctx.db.execute<TaskLinkRow>(
    sql`${linkRows(ctx, where)} ORDER BY link.created_at, link.id`,
  );
  return rows.map(toLinkView);
}

/**
 * A JSON array of TaskLinkRow for every link that touches a task in the project, in link order.
 * The caller checks project access and maps each row with toLinkView.
 */
export function projectTaskLinkRows(ctx: RepositoryContext, projectEntityId: string) {
  return sql<
    TaskLinkRow[]
  >`coalesce((SELECT json_agg(l ORDER BY l."createdAt", l.id) FROM (${linkRows(
    ctx,
    sql`(src.project_entity_id = ${projectEntityId} OR tgt.project_entity_id = ${projectEntityId})`,
  )}) l), '[]'::json)`;
}

/** Every link that touches the task. The caller checks task access. */
export function linksOfTask(ctx: RepositoryContext, taskEntityId: string) {
  return linkViews(
    ctx,
    sql`(link.source_task_entity_id = ${taskEntityId} OR link.target_task_entity_id = ${taskEntityId})`,
  );
}

// The caller can view `other`.
export async function addTaskLink(
  ctx: RepositoryContext,
  task: Locked<Task, "edit">,
  other: Task,
  relation: TaskLinkRelation,
) {
  const { db, scope } = ctx;
  if (task.entityId === other.entityId) throw new ValidationError("A task can't link to itself.");
  const link = stored(task.entityId, other.entityId, relation);
  // Links cross projects, so project locks do not order two writers. One lock per organization
  // keeps the cycle check and the insert together.
  await db.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`task_links:${scope.organizationId}`}, 0))`,
  );
  const pair = (source: string, target: string, kind: TaskLinkKind) =>
    and(
      eq(taskLinks.organizationId, scope.organizationId),
      eq(taskLinks.sourceTaskEntityId, source),
      eq(taskLinks.targetTaskEntityId, target),
      eq(taskLinks.kind, kind),
    );
  const [existing] = await db
    .select({ id: taskLinks.id })
    .from(taskLinks)
    .where(pair(link.sourceTaskEntityId, link.targetTaskEntityId, link.kind));
  if (existing) throw new ValidationError("These tasks already have this link.");
  if (link.kind === "duplicates") {
    const [reverse] = await db
      .select({ id: taskLinks.id })
      .from(taskLinks)
      .where(pair(link.targetTaskEntityId, link.sourceTaskEntityId, "duplicates"));
    if (reverse) throw new ValidationError("These tasks are already marked as duplicates.");
  }
  if (link.kind === "blocks") {
    const cycle = await db.execute(sql`
      WITH RECURSIVE blocked(entity_id) AS (
        SELECT ${link.targetTaskEntityId}::uuid
        UNION
        SELECT next.target_task_entity_id FROM ${taskLinks} next
        JOIN blocked ON blocked.entity_id = next.source_task_entity_id
        WHERE next.organization_id = ${scope.organizationId} AND next.kind = 'blocks'
      )
      SELECT 1 FROM blocked WHERE entity_id = ${link.sourceTaskEntityId}::uuid LIMIT 1
    `);
    if (cycle.length) throw new ValidationError("This link would make the tasks block each other.");
  }
  const [created] = await db
    .insert(taskLinks)
    .values({
      organizationId: scope.organizationId,
      ...link,
      createdByActorEntityId: scope.actorEntityId,
    })
    .returning();
  await recordLinkActivity(ctx, "Link added", task.entityId, other.entityId, relation);
  await ctx.touch(task.entityId);
  return created!;
}

// The link must touch the task.
export async function removeTaskLink(
  ctx: RepositoryContext,
  task: Locked<Task, "edit">,
  linkId: string,
) {
  const [removed] = await ctx.db
    .delete(taskLinks)
    .where(
      and(
        eq(taskLinks.organizationId, ctx.scope.organizationId),
        eq(taskLinks.id, linkId),
        or(
          eq(taskLinks.sourceTaskEntityId, task.entityId),
          eq(taskLinks.targetTaskEntityId, task.entityId),
        ),
      ),
    )
    .returning();
  if (!removed) throw new AccessDeniedError();
  const source = removed.sourceTaskEntityId === task.entityId;
  const relation = taskLinkRelation(removed.kind, source ? "source" : "target");
  await recordLinkActivity(
    ctx,
    "Link removed",
    task.entityId,
    source ? removed.targetTaskEntityId : removed.sourceTaskEntityId,
    relation,
  );
  await ctx.touch(task.entityId);
  return removed;
}

// Both tasks get a history row. The row names the relation only, never the other task.
async function recordLinkActivity(
  ctx: RepositoryContext,
  verb: "Link added" | "Link removed",
  taskEntityId: string,
  otherEntityId: string,
  relation: TaskLinkRelation,
) {
  await recordTaskActivity(ctx, taskEntityId, [`${verb}: ${taskLinkRelationLabels[relation]}`]);
  await recordTaskActivity(ctx, otherEntityId, [
    `${verb}: ${taskLinkRelationLabels[inverseTaskLinkRelation[relation]]}`,
  ]);
}
