import { taskStatusLabels } from "@startup-os/contracts/tasks";

import type { DatabaseExecutor } from "../../client";
import { ensureHumanActor } from "../../core/actors/provisioning";
import { user } from "../../core/authentication/schema";
import { member } from "../../core/organizations/schema";
import { RepositoryContext } from "../../core/repository-context";
import { AccessDeniedError } from "../../errors";
import type { MessagingIdentity } from "../messaging/access";
import { projectRepository } from "../projects/repository";
import { taskRepository } from "../tasks/repository";
import { and, eq } from "drizzle-orm";

export async function workspaceContext(db: DatabaseExecutor, scope: MessagingIdentity) {
  const [identity] = await db
    .select({ name: user.name })
    .from(user)
    .innerJoin(member, eq(member.userId, user.id))
    .where(
      and(
        eq(user.id, scope.userId),
        eq(user.emailVerified, true),
        eq(member.organizationId, scope.organizationId),
      ),
    );
  if (!identity) throw new AccessDeniedError();
  const actor = await ensureHumanActor(db, { ...scope, name: identity.name });
  const context = new RepositoryContext(db, {
    organizationId: scope.organizationId,
    actorEntityId: actor.entityId,
  });
  await context.requireActiveActor();
  return context;
}

export async function requireWork(
  context: RepositoryContext,
  entityId: string,
  level: "view" | "edit" | "owner" = "view",
) {
  const { entity } = await context.requireAccess(entityId, level);
  if (entity.entityType === "task") {
    const task = await taskRepository(context).get(entityId, level);
    return {
      entityId,
      entityType: "task" as const,
      title: task.title,
      projectEntityId: task.projectEntityId,
      status: task.status,
      statusName: taskStatusLabels[task.status],
    };
  }
  if (entity.entityType === "project") {
    const project = await projectRepository(context).get(entityId);
    return {
      entityId,
      entityType: "project" as const,
      title: project.name,
      projectEntityId: entityId,
      status: null,
      statusName: null,
    };
  }
  throw new AccessDeniedError();
}
