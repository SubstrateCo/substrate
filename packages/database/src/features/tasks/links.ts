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
import { relatedPair } from "../../core/links/repository";
import { entityLinks } from "../../core/links/schema";
import type { Authorized, RepositoryContext } from "../../core/repository-context";
import { AccessDeniedError, ValidationError } from "../../errors";
import { recordTaskActivity } from "../activity/events";
import { projects } from "../projects/schema";
import { tasks } from "./tasks.schema";
import { and, eq, or, sql, type SQL } from "drizzle-orm";

type Task = typeof tasks.$inferSelect;

function stored(taskEntityId: string, otherEntityId: string, relation: TaskLinkRelation) {
  const forward = { sourceEntityId: taskEntityId, targetEntityId: otherEntityId };
  const backward = { sourceEntityId: otherEntityId, targetEntityId: taskEntityId };
  switch (relation) {
    case "blocks":
      return { relationType: "blocks" as const, ...forward };
    case "blocked_by":
      return { relationType: "blocks" as const, ...backward };
    case "duplicates":
      return { relationType: "duplicates" as const, ...forward };
    case "duplicated_by":
      return { relationType: "duplicates" as const, ...backward };
    case "related_to":
      return {
        relationType: "related_to" as const,
        ...relatedPair(taskEntityId, otherEntityId),
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

function linkRows(ctx: RepositoryContext, where: SQL) {
  return sql`
    SELECT link.id, link.relation_type AS kind, link.created_at AS "createdAt",
      src.entity_id AS "sourceId", src.title AS "sourceTitle", src.status AS "sourceStatus",
      src.project_entity_id AS "sourceProjectId", src_project.name AS "sourceProjectName",
      ${ctx.readable(sql`src.entity_id`)} AS "sourceReadable",
      tgt.entity_id AS "targetId", tgt.title AS "targetTitle", tgt.status AS "targetStatus",
      tgt.project_entity_id AS "targetProjectId", tgt_project.name AS "targetProjectName",
      ${ctx.readable(sql`tgt.entity_id`)} AS "targetReadable"
    FROM ${entityLinks} link
    JOIN ${tasks} src ON src.organization_id = link.organization_id
      AND src.entity_id = link.source_entity_id
    JOIN ${tasks} tgt ON tgt.organization_id = link.organization_id
      AND tgt.entity_id = link.target_entity_id
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
    sql`(link.source_entity_id = ${taskEntityId} OR link.target_entity_id = ${taskEntityId})`,
  );
}

export async function addTaskLink(
  ctx: RepositoryContext,
  task: Authorized<Task, "edit">,
  other: Task,
  relation: TaskLinkRelation,
) {
  const { db, scope } = ctx;
  if (task.entityId === other.entityId) throw new ValidationError("A task can't link to itself.");
  const link = stored(task.entityId, other.entityId, relation);
  const pair = (source: string, target: string, kind: TaskLinkKind) =>
    and(
      eq(entityLinks.organizationId, scope.organizationId),
      eq(entityLinks.sourceEntityId, source),
      eq(entityLinks.targetEntityId, target),
      eq(entityLinks.relationType, kind),
    );
  const requireNewPair = async () => {
    const [existing] = await db
      .select({ id: entityLinks.id })
      .from(entityLinks)
      .where(pair(link.sourceEntityId, link.targetEntityId, link.relationType));
    if (existing) throw new ValidationError("These tasks already have this link.");
    if (link.relationType === "duplicates") {
      const [reverse] = await db
        .select({ id: entityLinks.id })
        .from(entityLinks)
        .where(pair(link.targetEntityId, link.sourceEntityId, "duplicates"));
      if (reverse) throw new ValidationError("These tasks are already marked as duplicates.");
    }
  };
  await requireNewPair();
  if (link.relationType === "blocks") {
    const cycle = await db.execute(sql`
      WITH RECURSIVE blocked(entity_id) AS (
        SELECT ${link.targetEntityId}::uuid
        UNION
        SELECT next.target_entity_id FROM ${entityLinks} next
        JOIN blocked ON blocked.entity_id = next.source_entity_id
        WHERE next.organization_id = ${scope.organizationId} AND next.relation_type = 'blocks'
      )
      SELECT 1 FROM blocked WHERE entity_id = ${link.sourceEntityId}::uuid LIMIT 1
    `);
    if (cycle.length) throw new ValidationError("This link would make the tasks block each other.");
  }
  const [created] = await db
    .insert(entityLinks)
    .values({
      organizationId: scope.organizationId,
      ...link,
      createdByActorEntityId: scope.actorEntityId,
    })
    .onConflictDoNothing()
    .returning();
  if (!created) {
    await requireNewPair();
    throw new ValidationError("This link would make the tasks block each other.");
  }
  await recordLinkActivity(ctx, "Link added", task, other, relation);
  await ctx.touch(task.entityId);
  return created;
}

export async function removeTaskLink(
  ctx: RepositoryContext,
  task: Authorized<Task, "edit">,
  linkId: string,
) {
  const [removed] = await ctx.db
    .delete(entityLinks)
    .where(
      and(
        eq(entityLinks.organizationId, ctx.scope.organizationId),
        eq(entityLinks.id, linkId),
        or(
          eq(entityLinks.sourceEntityId, task.entityId),
          eq(entityLinks.targetEntityId, task.entityId),
        ),
        sql`EXISTS (SELECT 1 FROM ${tasks} other WHERE other.organization_id = ${entityLinks.organizationId}
          AND other.entity_id IN (${entityLinks.sourceEntityId}, ${entityLinks.targetEntityId})
          AND other.entity_id <> ${task.entityId})`,
      ),
    )
    .returning();
  if (!removed) throw new AccessDeniedError();
  const source = removed.sourceEntityId === task.entityId;
  const relation = taskLinkRelation(removed.relationType, source ? "source" : "target");
  await recordLinkActivity(
    ctx,
    "Link removed",
    task,
    { entityId: source ? removed.targetEntityId : removed.sourceEntityId },
    relation,
  );
  await ctx.touch(task.entityId);
  return removed;
}

async function recordLinkActivity(
  ctx: RepositoryContext,
  verb: "Link added" | "Link removed",
  task: Task,
  other: Task | { entityId: string },
  relation: TaskLinkRelation,
) {
  await recordTaskActivity(ctx, task, [`${verb}: ${taskLinkRelationLabels[relation]}`]);
  await recordTaskActivity(ctx, other, [
    `${verb}: ${taskLinkRelationLabels[inverseTaskLinkRelation[relation]]}`,
  ]);
}
