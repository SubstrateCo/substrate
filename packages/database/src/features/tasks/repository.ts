import { taskStatusValues } from "@startup-os/contracts/tasks";

import { actors } from "../../core/actors/schema";
import { RepositoryContext, type PermissionLevel } from "../../core/repository-context";
import { AccessDeniedError, ValidationError } from "../../errors";
import { notifyAssignment, recordTaskActivity } from "../activity/events";
import { projectRepository, requiredText } from "../projects/repository";
import { taskComments } from "./comments.schema";
import type { CreateTaskInput, TaskFields } from "./contracts";
import { tasks } from "./tasks.schema";
import { and, asc, eq, inArray } from "drizzle-orm";

export function taskRepository(context: RepositoryContext) {
  const { db, scope } = context;
  const taskWhere = (id: string) =>
    and(eq(tasks.organizationId, scope.organizationId), eq(tasks.entityId, id));

  async function requireTask(entityId: string, level: PermissionLevel = "view", lock = false) {
    await context.requireAccess(entityId, level, lock);
    const [task] = await db.select().from(tasks).where(taskWhere(entityId));
    if (!task) throw new AccessDeniedError();
    await context.requireAccess(task.projectEntityId, level, lock);
    return task;
  }

  async function validate(
    ctx: RepositoryContext,
    projectEntityId: string,
    input: Partial<TaskFields>,
  ) {
    if (input.title !== undefined) requiredText(input.title, 300);
    if (
      input.priority !== undefined &&
      !["none", "low", "medium", "high", "urgent"].includes(input.priority)
    )
      throw new ValidationError("Invalid priority.");
    if (
      input.dueDate != null &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate) ||
        Number.isNaN(Date.parse(input.dueDate)) ||
        new Date(input.dueDate).toISOString().slice(0, 10) !== input.dueDate)
    )
      throw new ValidationError("Enter a valid due date.");
    if (input.assigneeActorEntityId) {
      await ctx.requireActiveActor(input.assigneeActorEntityId);
      await new RepositoryContext(ctx.db, {
        organizationId: scope.organizationId,
        actorEntityId: input.assigneeActorEntityId,
      }).requireAccess(projectEntityId, "view");
    }
    if (input.status !== undefined && !taskStatusValues.includes(input.status))
      throw new ValidationError("Select a standard task status.");
  }

  return {
    get: requireTask,
    async create(input: CreateTaskInput) {
      return db.transaction(async (tx) => {
        const ctx = new RepositoryContext(tx, scope);
        await ctx.requireAccess(input.projectEntityId, "edit", true);
        await validate(ctx, input.projectEntityId, input);
        if (input.parentTaskEntityId) {
          const parent = await taskRepository(ctx).get(input.parentTaskEntityId);
          if (parent.projectEntityId !== input.projectEntityId)
            throw new ValidationError("Subtasks must belong to their parent's project.");
        }
        const entity = await ctx.createEntity("task", input.projectEntityId);
        const [task] = await tx
          .insert(tasks)
          .values({
            organizationId: scope.organizationId,
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
        const event = await recordTaskActivity(ctx, task!.entityId, "Task created");
        await notifyAssignment(ctx, task!.entityId, task!.assigneeActorEntityId, event.id);
        return task!;
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
            inArray(tasks.entityId, context.readableEntities()),
          ),
        )
        .orderBy(asc(tasks.entityId));
    },
    async update(entityId: string, input: Partial<TaskFields>) {
      return db.transaction(async (tx) => {
        const ctx = new RepositoryContext(tx, scope);
        const task = await taskRepository(ctx).get(entityId, "edit", true);
        await validate(ctx, task.projectEntityId, input);
        const changes: string[] = [];
        if (input.status !== undefined && input.status !== task.status)
          changes.push("Status changed");
        if (
          input.assigneeActorEntityId !== undefined &&
          input.assigneeActorEntityId !== task.assigneeActorEntityId
        )
          changes.push("Assignee changed");
        if (input.title !== undefined && input.title.trim() !== task.title)
          changes.push("Title changed");
        if (input.description !== undefined && input.description !== task.description)
          changes.push("Description changed");
        if (input.priority !== undefined && input.priority !== task.priority)
          changes.push("Priority changed");
        if (input.dueDate !== undefined && input.dueDate !== task.dueDate)
          changes.push("Due date changed");
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
        for (const action of changes) {
          const event = await recordTaskActivity(ctx, entityId, action);
          if (action === "Assignee changed")
            await notifyAssignment(ctx, entityId, input.assigneeActorEntityId, event.id);
        }
        return updated!;
      });
    },
    async addComment(entityId: string, body: string) {
      const text = requiredText(body, 20000);
      return db.transaction(async (tx) => {
        const ctx = new RepositoryContext(tx, scope);
        await taskRepository(ctx).get(entityId, "comment", true);
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
    async listComments(entityId: string) {
      await requireTask(entityId);
      return db
        .select({
          id: taskComments.id,
          body: taskComments.body,
          createdAt: taskComments.createdAt,
          authorName: actors.name,
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
