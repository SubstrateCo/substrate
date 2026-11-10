import { taskPriorityValues, taskStatusValues } from "@startup-os/contracts/tasks";

import { visibleActorCondition } from "../../core/actors/access";
import { actorDisplayName } from "../../core/actors/display-name";
import { actors } from "../../core/actors/schema";
import { RepositoryContext, type PermissionLevel } from "../../core/repository-context";
import { AccessDeniedError, ValidationError } from "../../errors";
import { notifyAssignment, recordTaskActivity } from "../activity/events";
import { projectRepository, requiredText } from "../projects/repository";
import { liveTask } from "./access";
import { taskChanges } from "./changes";
import { taskComments } from "./comments.schema";
import type { CreateTaskInput, TaskFields } from "./contracts";
import { tasks } from "./tasks.schema";
import { and, asc, eq } from "drizzle-orm";

// Pure field checks run before the assignee query.
async function validate(
  ctx: RepositoryContext,
  projectEntityId: string,
  input: Partial<TaskFields>,
  currentAssigneeActorEntityId: string | null = null,
) {
  if (input.title !== undefined) requiredText(input.title, 300);
  if (input.priority !== undefined && !taskPriorityValues.includes(input.priority))
    throw new ValidationError("Invalid priority.");
  if (
    input.dueDate != null &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate) ||
      Number.isNaN(Date.parse(input.dueDate)) ||
      new Date(input.dueDate).toISOString().slice(0, 10) !== input.dueDate)
  )
    throw new ValidationError("Enter a valid due date.");
  if (input.status !== undefined && !taskStatusValues.includes(input.status))
    throw new ValidationError("Select a standard task status.");
  if (input.assigneeActorEntityId) {
    // Only the owner and the owner's agents can assign a local agent. Keeping an existing
    // assignee is not a new assignment.
    const [assignee] = await ctx.db
      .select({ entityId: actors.entityId })
      .from(actors)
      .where(
        and(
          eq(actors.organizationId, ctx.scope.organizationId),
          eq(actors.entityId, input.assigneeActorEntityId),
          input.assigneeActorEntityId === currentAssigneeActorEntityId
            ? undefined
            : visibleActorCondition(ctx.scope),
        ),
      );
    if (!assignee) throw new AccessDeniedError();
    await new RepositoryContext(ctx.db, {
      organizationId: ctx.scope.organizationId,
      actorEntityId: input.assigneeActorEntityId,
    }).requireAccess(projectEntityId, "view");
  }
}

// The caller must hold `project` from requireAccess(input.projectEntityId, "edit", true)
// in the current transaction. Locking first keeps the assignee check from revealing projects.
export async function createTaskInLockedProject(
  ctx: RepositoryContext,
  project: { entity: { entityId: string; entityType: string } },
  input: CreateTaskInput,
) {
  if (project.entity.entityType !== "project" || project.entity.entityId !== input.projectEntityId)
    throw new AccessDeniedError();
  await validate(ctx, input.projectEntityId, input);
  if (input.parentTaskEntityId) {
    const parent = await taskRepository(ctx).get(input.parentTaskEntityId);
    if (parent.projectEntityId !== input.projectEntityId)
      throw new ValidationError("Subtasks must belong to their parent's project.");
  }
  const entity = await ctx.createChildEntity("task", input.projectEntityId);
  const [task] = await ctx.db
    .insert(tasks)
    .values({
      organizationId: ctx.scope.organizationId,
      entityId: entity.entityId,
      projectEntityId: input.projectEntityId,
      parentTaskEntityId: input.parentTaskEntityId,
      title: requiredText(input.title, 300),
      description: input.description ?? "",
      status: input.status ?? "not_started",
      priority: input.priority ?? "none",
      assigneeActorEntityId: input.assigneeActorEntityId,
      dueDate: input.dueDate,
    })
    .returning();
  const [event] = await recordTaskActivity(ctx, task!.entityId, ["Task created"]);
  await notifyAssignment(ctx, task!.entityId, task!.assigneeActorEntityId, event!.id);
  return task!;
}

export function taskRepository(context: RepositoryContext) {
  const { db, scope } = context;
  const taskWhere = (id: string) =>
    and(eq(tasks.organizationId, scope.organizationId), eq(tasks.entityId, id));

  // A task's level is its project's level. The task's lock path includes the project.
  async function requireTask(entityId: string, level: PermissionLevel = "view", lock = false) {
    if (lock) await context.lockAccessPath(entityId);
    const [task] = await db
      .select()
      .from(tasks)
      .where(and(taskWhere(entityId), liveTask()));
    if (!task) throw new AccessDeniedError();
    await context.requireAccess(task.projectEntityId, level);
    return task;
  }

  return {
    get: requireTask,
    async create(input: CreateTaskInput) {
      return db.transaction(async (tx) => {
        const ctx = new RepositoryContext(tx, scope);
        const project = await ctx.requireAccess(input.projectEntityId, "edit", true);
        return createTaskInLockedProject(ctx, project, input);
      });
    },
    async list(projectEntityId: string) {
      await projectRepository(context).get(projectEntityId);
      return db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.organizationId, scope.organizationId),
            eq(tasks.projectEntityId, projectEntityId),
            liveTask(),
          ),
        )
        .orderBy(asc(tasks.entityId));
    },
    async update(entityId: string, input: Partial<TaskFields>, expectedProjectEntityId?: string) {
      return db.transaction(async (tx) => {
        const ctx = new RepositoryContext(tx, scope);
        const task = await taskRepository(ctx).get(entityId, "edit", true);
        if (expectedProjectEntityId && task.projectEntityId !== expectedProjectEntityId)
          throw new AccessDeniedError();
        await validate(ctx, task.projectEntityId, input, task.assigneeActorEntityId);
        const changes = taskChanges(task, input);
        const [updated] = await tx
          .update(tasks)
          .set({
            title: input.title === undefined ? undefined : requiredText(input.title, 300),
            description: input.description,
            status: input.status,
            priority: input.priority,
            assigneeActorEntityId: input.assigneeActorEntityId,
            dueDate: input.dueDate,
          })
          .where(taskWhere(entityId))
          .returning();
        await ctx.touch(entityId);
        const events = await recordTaskActivity(ctx, entityId, changes);
        const assignment = events.find((event) => event.action === "Assignee changed");
        if (assignment)
          await notifyAssignment(ctx, entityId, input.assigneeActorEntityId, assignment.id);
        return updated!;
      });
    },
    async addComment(entityId: string, body: string, expectedProjectEntityId?: string) {
      const text = requiredText(body, 20000);
      return db.transaction(async (tx) => {
        const ctx = new RepositoryContext(tx, scope);
        const task = await taskRepository(ctx).get(entityId, "comment", true);
        if (expectedProjectEntityId && task.projectEntityId !== expectedProjectEntityId)
          throw new AccessDeniedError();
        const [comment] = await tx
          .insert(taskComments)
          .values({
            organizationId: scope.organizationId,
            taskEntityId: entityId,
            authorActorEntityId: scope.actorEntityId,
            body: text,
          })
          .returning();
        return comment!;
      });
    },
    async listComments(entityId: string, projectEntityId: string) {
      const task = await requireTask(entityId);
      if (task.projectEntityId !== projectEntityId) throw new AccessDeniedError();
      return db
        .select({
          id: taskComments.id,
          body: taskComments.body,
          createdAt: taskComments.createdAt,
          authorName: actorDisplayName(),
          authorType: actors.type,
        })
        .from(taskComments)
        .innerJoin(
          actors,
          and(
            eq(actors.organizationId, taskComments.organizationId),
            eq(actors.entityId, taskComments.authorActorEntityId),
          ),
        )
        .where(
          and(
            eq(taskComments.organizationId, scope.organizationId),
            eq(taskComments.taskEntityId, entityId),
          ),
        )
        .orderBy(asc(taskComments.createdAt), asc(taskComments.id));
    },
  };
}
