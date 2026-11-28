import { realtimeKeys } from "@substrate/contracts/realtime";

import { entities } from "../../core/entities/schema";
import { RepositoryContext } from "../../core/repository-context";
import { AccessDeniedError, ValidationError } from "../../errors";
import { recordTaskActivity } from "../activity/events";
import { requireUnarchived } from "../projects/archive";
import { workHint } from "../realtime/routing";
import { liveTask } from "./access";
import { tasks } from "./tasks.schema";
import { and, eq, inArray, sql } from "drizzle-orm";

async function taskSubtree(ctx: RepositoryContext, projectId: string, taskId: string) {
  return ctx.db.execute<{ entityId: string }>(sql`
    WITH RECURSIVE subtree AS (
      SELECT entity_id FROM ${tasks}
      WHERE organization_id = ${ctx.scope.organizationId} AND project_entity_id = ${projectId}
        AND entity_id = ${taskId}
      UNION
      SELECT child.entity_id FROM ${tasks} child
      JOIN subtree parent ON child.parent_task_entity_id = parent.entity_id
      WHERE child.organization_id = ${ctx.scope.organizationId} AND child.project_entity_id = ${projectId}
    ) SELECT entity_id AS "entityId" FROM subtree
  `);
}

export function taskLifecycle(context: RepositoryContext) {
  const { scope } = context;
  async function requireTask(ctx: RepositoryContext, taskId: string, projectId: string) {
    const [task] = await ctx.db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.organizationId, scope.organizationId),
          eq(tasks.entityId, taskId),
          eq(tasks.projectEntityId, projectId),
          liveTask(),
        ),
      );
    if (!task) throw new AccessDeniedError();
    return task;
  }
  return {
    async delete(taskId: string, projectId: string) {
      return context.transaction(async (ctx) => {
        const tx = ctx.db;
        await ctx.requireStructuralAccess(projectId, "edit");
        await requireTask(ctx, taskId, projectId);
        await requireUnarchived(ctx, [projectId]);
        const subtree = await taskSubtree(ctx, projectId, taskId);
        ctx.effects.hint({
          audience: realtimeKeys.organization(scope.organizationId),
          domain: "access",
        });
        ctx.effects.hint(workHint(scope.organizationId, projectId));
        await tx
          .update(entities)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(
            and(
              eq(entities.organizationId, scope.organizationId),
              inArray(
                entities.entityId,
                subtree.map((task) => task.entityId),
              ),
            ),
          );
      });
    },
    async move(
      taskId: string,
      projectId: string,
      destinationProjectId: string,
      parentTaskId: string | null,
    ) {
      return context.transaction(async (ctx) => {
        const tx = ctx.db;
        const projectIds = [...new Set([projectId, destinationProjectId])];
        await ctx.requireStructuralAccessAll(projectIds, "edit", { type: "project" });
        const task = await requireTask(ctx, taskId, projectId);
        await requireUnarchived(ctx, projectIds);
        const subtree = await taskSubtree(ctx, projectId, taskId);
        const ids = subtree.map((row) => row.entityId);
        if (parentTaskId) {
          if (ids.includes(parentTaskId))
            throw new ValidationError(
              "A task cannot be its own parent or a child of its subtasks.",
            );
          const [parent] = await tx
            .select()
            .from(tasks)
            .where(
              and(
                eq(tasks.organizationId, scope.organizationId),
                eq(tasks.entityId, parentTaskId),
                eq(tasks.projectEntityId, destinationProjectId),
                liveTask(),
              ),
            );
          if (!parent) throw new ValidationError("Select a parent in the destination project.");
        }
        if (projectId !== destinationProjectId) {
          const live = await tx
            .select({ assignee: tasks.assigneeActorEntityId })
            .from(tasks)
            .where(
              and(
                eq(tasks.organizationId, scope.organizationId),
                inArray(tasks.entityId, ids),
                liveTask(),
              ),
            );
          await requireMovingAssignees(
            ctx,
            destinationProjectId,
            live.map((row) => row.assignee),
          );
          await tx.execute(sql`
            WITH moved_entities AS (
              UPDATE ${entities} SET access_entity_id = ${destinationProjectId}, updated_at = now()
              WHERE organization_id = ${scope.organizationId} AND entity_id IN ${ids}
              RETURNING entity_id
            )
            UPDATE ${tasks} SET project_entity_id = ${destinationProjectId},
              parent_task_entity_id = CASE WHEN entity_id = ${taskId} THEN ${parentTaskId}::uuid ELSE parent_task_entity_id END
            WHERE organization_id = ${scope.organizationId} AND entity_id IN (SELECT entity_id FROM moved_entities)
          `);
        } else {
          await tx
            .update(tasks)
            .set({ parentTaskEntityId: parentTaskId })
            .where(and(eq(tasks.organizationId, scope.organizationId), eq(tasks.entityId, taskId)));
          await ctx.touch(taskId);
        }
        if (projectId !== destinationProjectId)
          ctx.effects.hint({
            audience: realtimeKeys.organization(scope.organizationId),
            domain: "access",
          });
        if (
          task.projectEntityId !== destinationProjectId ||
          task.parentTaskEntityId !== parentTaskId
        )
          await recordTaskActivity(
            ctx,
            { entityId: taskId, projectEntityId: destinationProjectId },
            [projectId === destinationProjectId ? "Parent changed" : "Project changed"],
          );
      });
    },
  };
}
import { requireMovingAssignees } from "./assignment";
