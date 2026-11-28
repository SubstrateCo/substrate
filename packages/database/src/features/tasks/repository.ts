import { taskPriorityValues, taskStatusValues } from "@substrate/contracts/tasks";
import type { TaskLinkRelation } from "@substrate/contracts/tasks/links";

import {
  RepositoryContext,
  type Authorized,
  type AuthorizedAccess,
  type PermissionLevel,
} from "../../core/repository-context";
import { requiredText } from "../../core/validation";
import { AccessDeniedError, ConflictError, ValidationError } from "../../errors";
import { notifyAssignment, recordTaskActivity } from "../activity/events";
import { publishFiles } from "../files/publication";
import { taskAttachments } from "../files/schema";
import { archivedProjectMessage, inArchivedProject, requireUnarchived } from "../projects/archive";
import { claimProjectChange } from "./access";
import { requireAssignee } from "./assignment";
import { taskChanges } from "./changes";
import type { CreateTaskInput, TaskFields } from "./contracts";
import { ensureTaskDiscussion } from "./discussion";
import { taskLifecycle } from "./lifecycle";
import { addTaskLink, linksOfTask, removeTaskLink } from "./links";
import { queryTasks } from "./queries";
import { tasks } from "./tasks.schema";
import { and, eq, sql } from "drizzle-orm";

type Task = typeof tasks.$inferSelect;

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
    if (input.assigneeActorEntityId !== currentAssigneeActorEntityId)
      await claimProjectChange(ctx, projectEntityId);
    await requireAssignee(
      ctx,
      projectEntityId,
      input.assigneeActorEntityId,
      currentAssigneeActorEntityId,
    );
  }
}

export async function createTaskInProject(
  ctx: RepositoryContext,
  project: AuthorizedAccess<"edit">,
  input: CreateTaskInput,
) {
  if (project.entity.entityType !== "project" || project.entity.entityId !== input.projectEntityId)
    throw new AccessDeniedError();
  await requireUnarchived(ctx, [input.projectEntityId]);
  await validate(ctx, input.projectEntityId, input);
  if (input.parentTaskEntityId) {
    if (!input.assigneeActorEntityId) await claimProjectChange(ctx, input.projectEntityId);
    const parent = await taskRepository(ctx).get(input.parentTaskEntityId);
    if (parent.projectEntityId !== input.projectEntityId)
      throw new ValidationError("Subtasks must belong to their parent's project.");
  }
  const entity = await ctx.createChildEntity("task", project);
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
  const [event] = await recordTaskActivity(ctx, task!, ["Task created"]);
  const fileIds = input.attachmentFileIds ?? [];
  if (fileIds.length) {
    await publishFiles(ctx, project, fileIds);
    await ctx.db.insert(taskAttachments).values(
      fileIds.map((fileId, position) => ({
        organizationId: ctx.scope.organizationId,
        taskEntityId: task!.entityId,
        fileOrganizationId: ctx.scope.organizationId,
        fileId,
        addedByActorEntityId: ctx.scope.actorEntityId,
        position,
      })),
    );
  }
  await notifyAssignment(ctx, task!.entityId, task!.assigneeActorEntityId, event!.id);
  return task!;
}

export function taskRepository(context: RepositoryContext) {
  const { db, scope } = context;
  const taskWhere = (id: string) =>
    and(eq(tasks.organizationId, scope.organizationId), eq(tasks.entityId, id));

  async function requireTask<Level extends PermissionLevel = "view">(
    entityId: string,
    // SAFETY: Level defaults to "view", so the omitted argument is "view".
    level: Level = "view" as Level,
  ): Promise<Authorized<Task, Level>> {
    const [row] = await db
      .select({
        task: tasks,
        archived: sql<boolean>`${inArchivedProject(scope.organizationId, tasks.entityId)}`,
      })
      .from(tasks)
      .where(and(taskWhere(entityId), context.readable(tasks.entityId, level, "task")));
    if (!row) return context.deny(entityId, level, { type: "task" });
    if (level !== "view" && row.archived) throw new ValidationError(archivedProjectMessage);
    // SAFETY: the task is readable at `level`, which is what Authorized records.
    return row.task as Authorized<Task, Level>;
  }

  return {
    ...taskLifecycle(context),
    get: requireTask,
    async exportPage(projectEntityId: string, afterEntityId?: string) {
      return queryTasks(context, { projectEntityId, afterEntityId, limit: 100, ascending: true });
    },
    async create(input: CreateTaskInput) {
      return context.transaction(async (ctx) => {
        const project = await ctx.requireAccess(input.projectEntityId, "edit");
        return createTaskInProject(ctx, project, input);
      });
    },
    async list(projectEntityId: string) {
      return (await queryTasks(context, { projectEntityId, ascending: true })).map(
        (row) => row.task,
      );
    },
    async update(entityId: string, input: Partial<TaskFields>, expectedProjectEntityId?: string) {
      return context.transaction(async (ctx) => {
        const tx = ctx.db;
        const task = await taskRepository(ctx).get(entityId, "edit");
        if (expectedProjectEntityId && task.projectEntityId !== expectedProjectEntityId)
          throw new AccessDeniedError();
        await validate(ctx, task.projectEntityId, input, task.assigneeActorEntityId);
        const changes = taskChanges(task, input);
        if (!changes.length) return task;
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
          .where(and(taskWhere(entityId), eq(tasks.projectEntityId, task.projectEntityId)))
          .returning();
        if (!updated) throw new ConflictError("This record changed. Try again.");
        await ctx.touch(entityId);
        const events = await recordTaskActivity(ctx, task, changes);
        const assignment = events.find((event) => event.action === "Assignee changed");
        if (assignment)
          await notifyAssignment(ctx, entityId, input.assigneeActorEntityId, assignment.id);
        return updated;
      });
    },
    ensureDiscussion: (entityId: string, expectedProjectEntityId?: string) =>
      ensureTaskDiscussion(context, entityId, expectedProjectEntityId),
    /** Links the task to another one. `relation` is how this task relates to the other. */
    async addLink(
      entityId: string,
      relation: TaskLinkRelation,
      otherEntityId: string,
      expectedProjectEntityId?: string,
    ) {
      return context.transaction(async (ctx) => {
        const repository = taskRepository(ctx);
        const task = await repository.get(entityId, "edit");
        if (expectedProjectEntityId && task.projectEntityId !== expectedProjectEntityId)
          throw new AccessDeniedError();
        const other = await repository.get(otherEntityId);
        await requireUnarchived(ctx, [otherEntityId]);
        return addTaskLink(ctx, task, other, relation);
      });
    },
    async removeLink(entityId: string, linkId: string, expectedProjectEntityId?: string) {
      return context.transaction(async (ctx) => {
        const task = await taskRepository(ctx).get(entityId, "edit");
        if (expectedProjectEntityId && task.projectEntityId !== expectedProjectEntityId)
          throw new AccessDeniedError();
        return removeTaskLink(ctx, task, linkId);
      });
    },
    async listLinks(entityId: string) {
      await requireTask(entityId);
      return linksOfTask(context, entityId);
    },
  };
}
