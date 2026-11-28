import { taskStatusLabels } from "@substrate/contracts/tasks";

import type { AuthorizedAccess, RepositoryContext } from "../../core/repository-context";
import { AccessDeniedError } from "../../errors";
import { requireUnarchived } from "../projects/archive";
import { projects } from "../projects/schema";
import { tasks } from "../tasks/tasks.schema";
import { crmContextTargets, isCrmContextType } from "./crm-targets";
import { and, eq } from "drizzle-orm";

type Minimum = "view" | "edit" | "owner";

export async function requireWork<Level extends Minimum = "view">(
  context: RepositoryContext,
  entityId: string,
  // SAFETY: Level defaults to "view", so the omitted argument is "view".
  minimum: Level = "view" as Level,
  access?: AuthorizedAccess<Level>,
) {
  const { entity, level } =
    access ?? (await context.requireAccess(entityId, minimum, { type: ["task", "project"] }));
  if (minimum !== "view" && (entity.entityType === "task" || entity.entityType === "project"))
    await requireUnarchived(context, [entityId]);
  if (entity.entityType === "task") {
    const [task] = await context.db
      .select()
      .from(tasks)
      .where(
        and(eq(tasks.organizationId, context.scope.organizationId), eq(tasks.entityId, entityId)),
      );
    if (!task) throw new AccessDeniedError();
    return {
      entityId,
      entityType: "task" as const,
      title: task.title,
      projectEntityId: task.projectEntityId,
      accessEntityId: entity.accessEntityId,
      status: task.status,
      statusName: taskStatusLabels[task.status],
      level,
      updatedAt: entity.updatedAt,
    };
  }
  if (entity.entityType === "project") {
    const [project] = await context.db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.organizationId, context.scope.organizationId),
          eq(projects.entityId, entityId),
        ),
      );
    if (!project) throw new AccessDeniedError();
    return {
      entityId,
      entityType: "project" as const,
      title: project.name,
      projectEntityId: entityId,
      accessEntityId: entity.accessEntityId,
      status: null,
      statusName: null,
      level,
      updatedAt: entity.updatedAt,
    };
  }
  throw new AccessDeniedError();
}

export async function requireContextTarget<Level extends Minimum = "view">(
  context: RepositoryContext,
  entityId: string,
  // SAFETY: Level defaults to "view", so the omitted argument is "view".
  minimum: Level = "view" as Level,
) {
  const access = await context.requireAccess(entityId, minimum);
  const { entity, level } = access;
  if (entity.entityType === "task" || entity.entityType === "project")
    return requireWork(context, entityId, minimum, access);
  const type = entity.entityType;
  if (!isCrmContextType(type)) throw new AccessDeniedError();
  const { table, title, active } = crmContextTargets[type];
  const [record] = await context.db
    .select({ title })
    .from(table)
    .where(
      and(
        eq(table.organizationId, context.scope.organizationId),
        eq(table.entityId, entityId),
        minimum === "view" ? undefined : active,
      ),
    );
  if (!record) throw new AccessDeniedError();
  return {
    entityId,
    entityType: type,
    title: record.title,
    projectEntityId: null,
    contactEntityId: type === "contact_interaction" ? entity.accessEntityId : null,
    status: null,
    statusName: null,
    level,
    updatedAt: entity.updatedAt,
    accessEntityId: entity.accessEntityId,
  };
}
