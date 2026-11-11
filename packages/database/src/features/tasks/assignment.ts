import { visibleActorCondition } from "../../core/actors/access";
import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import type { RepositoryContext } from "../../core/repository-context";
import { AccessDeniedError, ValidationError } from "../../errors";
import { liveTask } from "./access";
import { tasks } from "./tasks.schema";
import { and, eq, or } from "drizzle-orm";

export async function requireAssignee(
  ctx: RepositoryContext,
  projectEntityId: string,
  actorEntityId: string,
  currentAssigneeActorEntityId: string | null = null,
) {
  const [assignee] = await ctx.db
    .select({ entityId: actors.entityId })
    .from(actors)
    .where(
      and(
        eq(actors.organizationId, ctx.scope.organizationId),
        eq(actors.entityId, actorEntityId),
        actorEntityId === currentAssigneeActorEntityId
          ? undefined
          : visibleActorCondition(ctx.scope),
      ),
    );
  if (!assignee || !(await ctx.actorCanAccess(actorEntityId, projectEntityId, "view")))
    throw new AccessDeniedError();
}

export async function requireMovingAssignees(
  ctx: RepositoryContext,
  projectEntityId: string,
  assignees: (string | null)[],
) {
  for (const assignee of new Set(assignees.filter((id) => id !== null))) {
    if (!(await ctx.actorCanAccess(assignee, projectEntityId, "view")))
      throw new ValidationError(
        "Reassign or unassign tasks whose assignees cannot access the destination project.",
      );
  }
}

export async function requireUnassignedProjectActor(
  ctx: RepositoryContext,
  projectEntityId: string,
  actorEntityId: string,
) {
  const { db, scope } = ctx;
  const [target] = await db
    .select({ userId: actors.userId })
    .from(actors)
    .where(
      and(eq(actors.organizationId, scope.organizationId), eq(actors.entityId, actorEntityId)),
    );
  const [assigned] = await db
    .select({ id: tasks.entityId })
    .from(tasks)
    .innerJoin(
      actors,
      and(
        eq(actors.organizationId, tasks.organizationId),
        eq(actors.entityId, tasks.assigneeActorEntityId),
      ),
    )
    .leftJoin(userAgents, eq(userAgents.id, actors.userAgentId))
    .where(
      and(
        eq(tasks.organizationId, scope.organizationId),
        eq(tasks.projectEntityId, projectEntityId),
        liveTask(),
        or(
          eq(actors.entityId, actorEntityId),
          target?.userId ? eq(userAgents.userId, target.userId) : undefined,
        ),
      ),
    )
    .limit(1);
  if (assigned)
    throw new ValidationError(
      "Reassign or unassign this person’s and their agents’ tasks before removing project access.",
    );
}
