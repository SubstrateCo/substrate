import type { TaskStatus } from "@substrate/contracts/tasks";

import { actorAuthorKind, actorDisplayName } from "../../core/actors/display-name";
import { actorPicture } from "../../core/actors/picture";
import { actors } from "../../core/actors/schema";
import { entities } from "../../core/entities/schema";
import type { RepositoryContext } from "../../core/repository-context";
import type { SessionIdentity } from "../../core/session/identity";
import { AccessDeniedError } from "../../errors";
import { taskActivity } from "../activity/schema";
import { messageEntityReferences } from "../context/schema";
import { visibleConversationIds, visibleConversations } from "../messaging/access";
import { messagingConversations, messagingMessages } from "../messaging/schema";
import { projects } from "../projects/schema";
import { liveProjectTasks, liveTask } from "./access";
import { taskComments } from "./comments.schema";
import { tasks } from "./tasks.schema";
import { and, asc, countDistinct, desc, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

interface QueryPage {
  offset?: number;
  limit?: number;
  since?: Date;
  until?: Date;
  ascending?: boolean;
}

export async function queryTasks(
  ctx: RepositoryContext,
  input: QueryPage & {
    projectEntityId: string;
    statuses?: TaskStatus[];
    assigneeActorEntityId?: string;
    parentTaskEntityId?: string | null;
  },
) {
  const { entity } = await ctx.requireAccess(input.projectEntityId, "view");
  if (entity.entityType !== "project") throw new AccessDeniedError();
  let parentFilter;
  if (input.parentTaskEntityId === null) parentFilter = isNull(tasks.parentTaskEntityId);
  else if (input.parentTaskEntityId)
    parentFilter = eq(tasks.parentTaskEntityId, input.parentTaskEntityId);
  const query = ctx.db
    .select({
      task: tasks,
      assignee: { id: actors.entityId, name: actorDisplayName(), type: actors.type },
      updatedAt: entities.updatedAt,
    })
    .from(tasks)
    .innerJoin(entities, eq(entities.entityId, tasks.entityId))
    .leftJoin(
      actors,
      and(
        eq(actors.entityId, tasks.assigneeActorEntityId),
        eq(actors.organizationId, ctx.scope.organizationId),
      ),
    )
    .where(
      and(
        liveProjectTasks(ctx.scope, input.projectEntityId),
        input.statuses ? inArray(tasks.status, input.statuses) : undefined,
        input.assigneeActorEntityId
          ? eq(tasks.assigneeActorEntityId, input.assigneeActorEntityId)
          : undefined,
        parentFilter,
      ),
    )
    .orderBy(
      ...(input.ascending
        ? [asc(tasks.entityId)]
        : [desc(entities.updatedAt), desc(tasks.entityId)]),
    )
    .offset(input.offset ?? 0);
  return input.limit === undefined ? query : query.limit(input.limit);
}

// The caller authorizes the task before querying its comments or detail.
export async function queryTaskComments(
  ctx: RepositoryContext,
  taskEntityId: string,
  ownerUserId: string,
  page: QueryPage = {},
) {
  const order = page.ascending ? asc : desc;
  const query = ctx.db
    .select({
      id: taskComments.id,
      body: taskComments.body,
      createdAt: taskComments.createdAt,
      author: {
        id: actors.entityId,
        name: actorDisplayName(),
        type: actors.type,
        kind: actorAuthorKind(ownerUserId),
      },
      authorImage: actorPicture(ctx.scope),
    })
    .from(taskComments)
    .innerJoin(
      actors,
      and(
        eq(actors.entityId, taskComments.authorActorEntityId),
        eq(actors.organizationId, taskComments.organizationId),
      ),
    )
    .where(
      and(
        eq(taskComments.organizationId, ctx.scope.organizationId),
        eq(taskComments.taskEntityId, taskEntityId),
        page.since ? gte(taskComments.createdAt, page.since) : undefined,
        page.until ? lt(taskComments.createdAt, page.until) : undefined,
      ),
    )
    .orderBy(order(taskComments.createdAt), order(taskComments.id))
    .offset(page.offset ?? 0);
  return page.limit === undefined ? query : query.limit(page.limit);
}

export async function queryTaskDetail(
  ctx: RepositoryContext,
  identity: SessionIdentity,
  task: typeof tasks.$inferSelect,
) {
  const { db, scope } = ctx;
  const taskId = task.entityId;
  const parent = alias(tasks, "parent");
  const subtask = alias(tasks, "subtask");
  const subtaskCount = db
    .select({ total: sql`count(*)` })
    .from(subtask)
    .where(
      and(
        eq(subtask.organizationId, scope.organizationId),
        eq(subtask.projectEntityId, tasks.projectEntityId),
        eq(subtask.parentTaskEntityId, tasks.entityId),
        liveTask(subtask.entityId),
      ),
    );
  const commentCount = db
    .select({ total: sql`count(*)` })
    .from(taskComments)
    .where(
      and(
        eq(taskComments.organizationId, scope.organizationId),
        eq(taskComments.taskEntityId, tasks.entityId),
      ),
    );
  const [detail] = await db
    .select({
      assignee: { id: actors.entityId, name: actorDisplayName(), type: actors.type },
      projectName: projects.name,
      createdAt: entities.createdAt,
      updatedAt: entities.updatedAt,
      parent: { id: parent.entityId, title: parent.title },
      subtaskCount: sql<number>`(${subtaskCount})`.mapWith(Number),
      commentCount: sql<number>`(${commentCount})`.mapWith(Number),
    })
    .from(tasks)
    .innerJoin(entities, eq(entities.entityId, tasks.entityId))
    .innerJoin(projects, eq(projects.entityId, tasks.projectEntityId))
    .leftJoin(
      actors,
      and(
        eq(actors.entityId, tasks.assigneeActorEntityId),
        eq(actors.organizationId, scope.organizationId),
      ),
    )
    .leftJoin(
      parent,
      and(
        eq(parent.organizationId, scope.organizationId),
        eq(parent.entityId, tasks.parentTaskEntityId),
        liveTask(parent.entityId),
      ),
    )
    .where(and(eq(tasks.organizationId, scope.organizationId), eq(tasks.entityId, taskId)));
  const references = and(
    eq(messageEntityReferences.organizationId, scope.organizationId),
    eq(messageEntityReferences.entityId, taskId),
    inArray(messageEntityReferences.conversationId, visibleConversationIds(db, identity)),
  );
  const [linked] = await db
    .select({ total: countDistinct(messageEntityReferences.messageId) })
    .from(messageEntityReferences)
    .where(references);
  const [source] = await db
    .select({
      id: messagingMessages.id,
      conversationId: messagingMessages.conversationId,
      threadId: messagingMessages.threadId,
    })
    .from(messageEntityReferences)
    .innerJoin(messagingMessages, eq(messagingMessages.id, messageEntityReferences.messageId))
    .where(and(references, eq(messageEntityReferences.purpose, "source")))
    .orderBy(asc(messageEntityReferences.createdAt))
    .limit(1);
  if (!detail) throw new AccessDeniedError();
  return { detail, linkedMessageCount: linked!.total, source };
}

export async function queryTaskActivity(
  ctx: RepositoryContext,
  identity: SessionIdentity,
  taskEntityId: string,
  page: QueryPage = {},
) {
  const { entity } = await ctx.requireAccess(taskEntityId, "view");
  if (entity.entityType !== "task") throw new AccessDeniedError();
  const query = ctx.db
    .select({
      id: taskActivity.id,
      actor: { id: actors.entityId, name: actorDisplayName(), type: actors.type },
      action: taskActivity.action,
      createdAt: taskActivity.createdAt,
      sourceMessageId: messagingMessages.id,
      conversationId: messagingConversations.id,
      threadId: messagingMessages.threadId,
    })
    .from(taskActivity)
    .innerJoin(actors, eq(actors.entityId, taskActivity.actorEntityId))
    .leftJoin(messagingMessages, eq(messagingMessages.id, taskActivity.sourceMessageId))
    .leftJoin(
      messagingConversations,
      eq(messagingConversations.id, messagingMessages.conversationId),
    )
    .where(
      and(
        eq(taskActivity.organizationId, ctx.scope.organizationId),
        eq(taskActivity.taskEntityId, taskEntityId),
        or(isNull(taskActivity.sourceMessageId), visibleConversations(ctx.db, identity)),
        page.since ? gte(taskActivity.createdAt, page.since) : undefined,
        page.until ? lt(taskActivity.createdAt, page.until) : undefined,
      ),
    )
    .orderBy(desc(taskActivity.createdAt), desc(taskActivity.id))
    .offset(page.offset ?? 0);
  return page.limit === undefined ? query : query.limit(page.limit);
}
