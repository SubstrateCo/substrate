import type { ContextEntityType } from "@substrate/contracts/context/input";
import { managedPicture } from "@substrate/contracts/files/pictures";

import type { DatabaseExecutor } from "../../client";
import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import { user } from "../../core/authentication/schema";
import { member } from "../../core/organizations/schema";
import type { RepositoryContext } from "../../core/repository-context";
import type { SessionIdentity } from "../../core/session/identity";
import { workspaceContext } from "../../core/session/workspace";
import { ConflictError, AccessDeniedError } from "../../errors";
import { recordTaskActivity } from "../activity/events";
import { recordCrmActivity } from "../crm/activity";
import { requireMessage, visibleConversations } from "../messaging/access";
import { messageViews, selectMessages } from "../messaging/messages";
import { messagingConversations, messagingMessages } from "../messaging/schema";
import { referenceChangeHints } from "../realtime/routing";
import { liveProjectTasks } from "../tasks/access";
import type { CreateTaskInput } from "../tasks/contracts";
import { createTaskInLockedProject, taskRepository } from "../tasks/repository";
import { tasks } from "../tasks/tasks.schema";
import { requireContextTarget } from "./access";
import { messagePeople, messageWorkLinks } from "./message-metadata";
import { messagePage } from "./message-page";
import { messageEntityReferences, sourceTaskRequests } from "./schema";
import { contextSearch } from "./search";
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";

interface ReferenceMessage {
  messageId: string;
  conversationId?: string;
}
interface ReferenceTarget {
  id: string;
  type?: ContextEntityType;
}

// All message mutations lock conversation, access paths, then message. Source creation also
// locks the destination in the same access-path order, so a source cannot move while it waits.
async function lockSourceMessage(
  ctx: RepositoryContext,
  scope: SessionIdentity,
  messageId: string,
  minimum: "view" | "comment",
  destinationIds: string[] = [],
) {
  return requireMessage(ctx.db, scope, messageId, "share", async (conversation) => {
    if (!conversation.taskEntityId) return;
    await ctx.lockAccessPaths([...destinationIds, conversation.taskEntityId]);
    await ctx.requireAccess(conversation.taskEntityId, minimum);
  });
}

async function referenceEndpoints(
  ctx: RepositoryContext,
  scope: SessionIdentity,
  source: ReferenceMessage,
  target: ReferenceTarget,
  level: "view" | "edit",
) {
  const { message, conversation } = await lockSourceMessage(
    ctx,
    scope,
    source.messageId,
    "comment",
    [target.id],
  );
  if (message.deletedAt && level === "edit") throw new AccessDeniedError();
  if (source.conversationId && message.conversationId !== source.conversationId)
    throw new AccessDeniedError();
  if (conversation.organizationId !== scope.organizationId) throw new AccessDeniedError();
  if (!conversation.taskEntityId) await ctx.lockAccessPaths([target.id]);
  const work = await requireContextTarget(ctx, target.id, level);
  if (target.type && work.entityType !== target.type) throw new AccessDeniedError();
  return { conversation, work };
}

// Callers resolve the workspace context; this performs the message and work checks once.
export async function attachReference(
  ctx: RepositoryContext,
  scope: SessionIdentity,
  source: ReferenceMessage,
  target: ReferenceTarget,
) {
  const { conversation, work } = await referenceEndpoints(ctx, scope, source, target, "edit");
  if (conversation.organizationId !== scope.organizationId) throw new AccessDeniedError();
  const rows = await ctx.db
    .insert(messageEntityReferences)
    .values({
      organizationId: scope.organizationId,
      conversationId: conversation.id,
      messageId: source.messageId,
      entityId: target.id,
      entityType: work.entityType,
      purpose: "association",
      createdByActorEntityId: ctx.scope.actorEntityId,
    })
    .onConflictDoNothing()
    .returning();
  if (rows.length && work.entityType === "task")
    await recordTaskActivity(ctx, work, ["Discussion linked"], source.messageId);
  if (rows.length && ["contact", "account", "deal"].includes(work.entityType))
    await recordCrmActivity(ctx, { entityId: work.entityId, action: "discussion_linked" });
  if (rows.length)
    for (const hint of referenceChangeHints(
      scope.organizationId,
      [
        work.projectEntityId === null
          ? {
              entityId: work.entityId,
              entityType: work.entityType,
              accessEntityId: work.accessEntityId,
            }
          : work,
      ],
      {
        id: source.messageId,
        conversationId: conversation.id,
      },
    ))
      ctx.effects.hint(hint);
  return rows.length > 0;
}

export async function detachReference(
  ctx: RepositoryContext,
  scope: SessionIdentity,
  source: ReferenceMessage,
  target: ReferenceTarget,
) {
  const { db } = ctx;
  const { conversation, work } = await referenceEndpoints(ctx, scope, source, target, "view");
  const [reference] = await db
    .select()
    .from(messageEntityReferences)
    .where(
      and(
        eq(messageEntityReferences.messageId, source.messageId),
        eq(messageEntityReferences.entityId, target.id),
        eq(messageEntityReferences.organizationId, scope.organizationId),
        eq(messageEntityReferences.purpose, "association"),
      ),
    );
  if (!reference) return false;
  if (reference.createdByActorEntityId !== ctx.scope.actorEntityId && work.level !== "owner")
    throw new AccessDeniedError();
  const rows = await db
    .delete(messageEntityReferences)
    .where(
      and(
        eq(messageEntityReferences.messageId, source.messageId),
        eq(messageEntityReferences.entityId, target.id),
        eq(messageEntityReferences.purpose, "association"),
      ),
    )
    .returning();
  if (rows.length && work.entityType === "task")
    await recordTaskActivity(ctx, work, ["Discussion unlinked"], source.messageId);
  if (rows.length && ["contact", "account", "deal"].includes(work.entityType))
    await recordCrmActivity(ctx, { entityId: work.entityId, action: "discussion_unlinked" });
  if (rows.length)
    for (const hint of referenceChangeHints(
      scope.organizationId,
      [
        work.projectEntityId === null
          ? {
              entityId: work.entityId,
              entityType: work.entityType,
              accessEntityId: work.accessEntityId,
            }
          : work,
      ],
      {
        id: source.messageId,
        conversationId: conversation.id,
      },
    ))
      ctx.effects.hint(hint);
  return rows.length > 0;
}

/** Marks a new task as created from a message. Callers have checked the message and the task. */
export async function recordTaskSource(
  ctx: RepositoryContext,
  source: { messageId: string; conversationId: string },
  task: { entityId: string; projectEntityId: string },
) {
  await ctx.db.insert(messageEntityReferences).values({
    organizationId: ctx.scope.organizationId,
    conversationId: source.conversationId,
    messageId: source.messageId,
    entityId: task.entityId,
    entityType: "task",
    purpose: "source",
    createdByActorEntityId: ctx.scope.actorEntityId,
  });
  await recordTaskActivity(ctx, task, ["Created from a discussion"], source.messageId);
  for (const hint of referenceChangeHints(ctx.scope.organizationId, [task], {
    id: source.messageId,
    conversationId: source.conversationId,
  }))
    ctx.effects.hint(hint);
}

export function createContextRepository(context: RepositoryContext, scope: SessionIdentity) {
  const { db } = context;
  const transaction = <T>(work: (ctx: RepositoryContext) => Promise<T>) =>
    context.transaction(work);
  return {
    messagePage: (messageIds: string[]) => messagePage(context, scope, messageIds),
    async createTaskFromMessage(input: CreateTaskInput & { requestId: string; messageId: string }) {
      return transaction(async (ctx) => {
        const tx = ctx.db;
        const { conversation, message } = await lockSourceMessage(
          ctx,
          scope,
          input.messageId,
          "view",
          [input.projectEntityId],
        );
        if (message.deletedAt) throw new AccessDeniedError();
        if (conversation.organizationId !== scope.organizationId) throw new AccessDeniedError();
        const project = await ctx.requireAccess(input.projectEntityId, "edit", true);
        // Project access locking serializes retries, including simultaneous submissions.
        const fingerprint = JSON.stringify({
          messageId: input.messageId,
          projectEntityId: input.projectEntityId,
          title: input.title.trim(),
          description: input.description ?? "",
          status: input.status ?? null,
          priority: input.priority ?? "none",
          assigneeActorEntityId: input.assigneeActorEntityId ?? null,
          dueDate: input.dueDate ?? null,
          parentTaskEntityId: input.parentTaskEntityId ?? null,
        });
        const [existing] = await tx
          .select()
          .from(sourceTaskRequests)
          .where(
            and(
              eq(sourceTaskRequests.organizationId, scope.organizationId),
              eq(sourceTaskRequests.actorEntityId, ctx.scope.actorEntityId),
              eq(sourceTaskRequests.requestId, input.requestId),
            ),
          );
        if (existing) {
          if (existing.fingerprint !== fingerprint)
            throw new ConflictError("This request was already used for different task details.");
          return taskRepository(ctx).get(existing.taskEntityId);
        }
        const task = await createTaskInLockedProject(ctx, project, input);
        await recordTaskSource(
          ctx,
          { messageId: input.messageId, conversationId: conversation.id },
          task,
        );
        await tx.insert(sourceTaskRequests).values({
          organizationId: scope.organizationId,
          actorEntityId: ctx.scope.actorEntityId,
          requestId: input.requestId,
          fingerprint,
          taskEntityId: task.entityId,
        });
        return task;
      });
    },
    async attach(messageId: string, entityId: string) {
      return transaction(async (ctx) => {
        return attachReference(ctx, scope, { messageId }, { id: entityId });
      });
    },
    async detach(messageId: string, entityId: string) {
      return transaction(async (ctx) => {
        return detachReference(ctx, scope, { messageId }, { id: entityId });
      });
    },
    async messageLinks(messageId: string) {
      const ctx = context;
      const { conversation } = await requireMessage(db, scope, messageId);
      if (conversation.organizationId !== scope.organizationId) return [];
      return (await messageWorkLinks(ctx, [messageId])).get(messageId) ?? [];
    },
    async messagePeople(messageId: string) {
      const { message } = await requireMessage(db, scope, messageId);
      return (await messagePeople(db, scope, [message])).get(messageId)!;
    },
    async related(entityId: string) {
      const entity = await requireContextTarget(context, entityId);
      const projectTasks =
        entity.entityType === "project"
          ? db
              .select({ entityId: tasks.entityId })
              .from(tasks)
              .where(liveProjectTasks(scope, entityId))
          : undefined;
      return db
        .select({
          messageId: messagingMessages.id,
          conversationId: messagingConversations.id,
          conversationName: messagingConversations.name,
          body: sql<string>`case when ${messagingMessages.deletedAt} is null then ${messagingMessages.body} else '' end`,
          deletedAt: messagingMessages.deletedAt,
          threadId: messagingMessages.threadId,
          authorName: sql<string>`case when ${actors.type} = 'agent'
            then coalesce(${userAgents.name}, 'Agent') else ${user.name} end`,
          authorImage: sql<string | null>`case when ${actors.type} = 'agent' then
            case when ${userAgents.userId} = ${scope.userId}
              then '/api/v1/files/' || ${userAgents.imageFileId}::text || '/content' end
            else case when ${member.id} is not null then ${user.image} end end`.mapWith(
            (value: string | null) => {
              const parsed = managedPicture.safeParse(value);
              return parsed.success ? parsed.data : null;
            },
          ),
          authorType: actors.type,
          createdAt: messagingMessages.createdAt,
          purpose: messageEntityReferences.purpose,
          replyCount: sql<number>`(select count(*)::int from ${messagingMessages} replies where replies.conversation_id = ${messagingMessages.conversationId} and replies.thread_id = coalesce(${messagingMessages.threadId}, ${messagingMessages.id}))`,
        })
        .from(messageEntityReferences)
        .innerJoin(messagingMessages, eq(messagingMessages.id, messageEntityReferences.messageId))
        .innerJoin(
          messagingConversations,
          eq(messagingConversations.id, messageEntityReferences.conversationId),
        )
        .innerJoin(actors, eq(actors.entityId, messagingMessages.authorActorEntityId))
        .leftJoin(userAgents, eq(userAgents.id, actors.userAgentId))
        .leftJoin(user, eq(user.id, actors.userId))
        .leftJoin(
          member,
          and(eq(member.userId, actors.userId), eq(member.organizationId, scope.organizationId)),
        )
        .where(
          and(
            eq(messageEntityReferences.organizationId, scope.organizationId),
            entity.entityType !== "task" && entity.entityType !== "project"
              ? isNull(messagingMessages.deletedAt)
              : undefined,
            or(
              eq(messageEntityReferences.entityId, entityId),
              projectTasks ? inArray(messageEntityReferences.entityId, projectTasks) : undefined,
            ),
            visibleConversations(db, scope),
          ),
        )
        .orderBy(asc(messageEntityReferences.createdAt))
        .limit(100);
    },
    async messageTarget(conversationId: string, messageId: string) {
      const actorEntityId = context.scope.actorEntityId;
      // Reads the message and its thread root together; each row must be visible.
      const rows = await selectMessages(db, scope)
        .innerJoin(
          messagingConversations,
          eq(messagingConversations.id, messagingMessages.conversationId),
        )
        .where(
          and(
            or(
              eq(messagingMessages.id, messageId),
              sql`${messagingMessages.id} = (select thread.thread_id from ${messagingMessages} thread where thread.id = ${messageId}::uuid)`,
            ),
            visibleConversations(db, scope),
          ),
        );
      const target = rows.find((row) => row.message.id === messageId);
      if (!target || target.message.conversationId !== conversationId)
        throw new AccessDeniedError();
      const root = target.message.threadId
        ? rows.find((row) => row.message.id === target.message.threadId)
        : target;
      if (!root) throw new AccessDeniedError();
      const [message, thread] = await messageViews(
        db,
        scope,
        actorEntityId,
        conversationId,
        target === root ? [target] : [target, root],
      );
      return { message: message!, root: thread ?? message! };
    },
    search: (input: Parameters<typeof contextSearch>[2], signal?: AbortSignal) =>
      contextSearch(context, scope, input, signal),
  };
}

// Trusted non-HTTP entry point. Each operation starts a new scope, like request middleware does.
export function createContextService(db: DatabaseExecutor, scope: SessionIdentity) {
  type Repository = ReturnType<typeof createContextRepository>;
  const run = async <T>(work: (repository: Repository) => Promise<T>) => {
    const { context } = await workspaceContext(db, scope);
    return work(createContextRepository(context, scope));
  };
  return {
    messagePage: (...args: Parameters<Repository["messagePage"]>) =>
      run((repo) => repo.messagePage(...args)),
    createTaskFromMessage: (...args: Parameters<Repository["createTaskFromMessage"]>) =>
      run((repo) => repo.createTaskFromMessage(...args)),
    attach: (...args: Parameters<Repository["attach"]>) => run((repo) => repo.attach(...args)),
    detach: (...args: Parameters<Repository["detach"]>) => run((repo) => repo.detach(...args)),
    messageLinks: (...args: Parameters<Repository["messageLinks"]>) =>
      run((repo) => repo.messageLinks(...args)),
    messagePeople: (...args: Parameters<Repository["messagePeople"]>) =>
      run((repo) => repo.messagePeople(...args)),
    related: (...args: Parameters<Repository["related"]>) => run((repo) => repo.related(...args)),
    messageTarget: (...args: Parameters<Repository["messageTarget"]>) =>
      run((repo) => repo.messageTarget(...args)),
    search: (...args: Parameters<Repository["search"]>) => run((repo) => repo.search(...args)),
  };
}
