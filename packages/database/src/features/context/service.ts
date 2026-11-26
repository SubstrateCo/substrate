import type { ContextEntityType } from "@substrate/contracts/context/input";

import {
  joinActorProfile,
  joinedActorName,
  joinedActorPicture,
} from "../../core/actors/joined-profile";
import { actors } from "../../core/actors/schema";
import type { DatabaseExecutor } from "../../core/executor";
import type { RepositoryContext } from "../../core/repository-context";
import { previousRequest, recordRequest, requestFingerprint } from "../../core/requests/once";
import type { SessionIdentity } from "../../core/session/identity";
import { workspaceContext } from "../../core/session/workspace";
import { AccessDeniedError, ValidationError } from "../../errors";
import { recordTaskActivity } from "../activity/events";
import { recordCrmActivity } from "../crm/activity";
import { requireMessage, visibleConversations } from "../messaging/access";
import { messageViews, selectMessages } from "../messaging/messages/messages";
import { messagingConversations, messagingMessages } from "../messaging/schema";
import { requireUnarchived } from "../projects/archive";
import { referenceChangeHints } from "../realtime/routing";
import { liveProjectTasks } from "../tasks/access";
import type { CreateTaskInput } from "../tasks/contracts";
import { createTaskInProject, taskRepository } from "../tasks/repository";
import { tasks } from "../tasks/tasks.schema";
import { requireContextTarget } from "./access";
import { messagePeople, messageWorkLinks } from "./message-references/message-metadata";
import { messagePage } from "./message-references/message-page";
import { recordLabels } from "./record-labels";
import { messageEntityReferences } from "./schema";
import { contextSearch } from "./search";
import { and, desc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { alias, type PgSelectQueryBuilder } from "drizzle-orm/pg-core";

interface ReferenceMessage {
  messageId: string;
  conversationId?: string;
}
interface ReferenceTarget {
  id: string;
  type?: ContextEntityType;
}

async function referenceEndpoints(
  ctx: RepositoryContext,
  scope: SessionIdentity,
  source: ReferenceMessage,
  target: ReferenceTarget,
  level: "view" | "edit",
) {
  const { message, conversation } = await requireMessage(ctx.db, scope, source.messageId);
  // Seeing a task discussion needs view access; changing its references needs comment access.
  if (conversation.taskEntityId) await ctx.requireAccess(conversation.taskEntityId, "comment");
  if (message.deletedAt && level === "edit") throw new AccessDeniedError();
  if (source.conversationId && message.conversationId !== source.conversationId)
    throw new AccessDeniedError();
  if (conversation.organizationId !== scope.organizationId) throw new AccessDeniedError();
  const work = await requireContextTarget(ctx, target.id, level);
  if (target.type && work.entityType !== target.type) throw new AccessDeniedError();
  // Neither an archived task's discussion nor archived work changes its linked messages.
  await requireUnarchived(ctx, [
    work.entityId,
    ...(conversation.taskEntityId ? [conversation.taskEntityId] : []),
  ]);
  return { conversation, work };
}

function hintReferenceChange(
  ctx: RepositoryContext,
  scope: SessionIdentity,
  work: Awaited<ReturnType<typeof referenceEndpoints>>["work"],
  messageId: string,
  conversationId: string,
) {
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
    { id: messageId, conversationId },
  ))
    ctx.effects.hint(hint);
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
  if (rows.length) hintReferenceChange(ctx, scope, work, source.messageId, conversation.id);
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
  if (rows.length) hintReferenceChange(ctx, scope, work, source.messageId, conversation.id);
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

/** Joins each message reference to its message, conversation and author actor. */
export function joinReferenceMessages<T extends PgSelectQueryBuilder>(query: T) {
  return query
    .innerJoin(messagingMessages, eq(messagingMessages.id, messageEntityReferences.messageId))
    .innerJoin(
      messagingConversations,
      eq(messagingConversations.id, messageEntityReferences.conversationId),
    )
    .innerJoin(actors, eq(actors.entityId, messagingMessages.authorActorEntityId));
}

/** The most discussions a record shows. */
const relatedLimit = 100;

export function createContextRepository(context: RepositoryContext, scope: SessionIdentity) {
  const { db } = context;
  const transaction = <T>(work: (ctx: RepositoryContext) => Promise<T>) =>
    context.transaction(work);
  // Each message with its thread root, in request order. A message that is missing, hidden,
  // outside the named conversation, or whose root is hidden is left out.
  async function messageTargets(targets: { conversationId: string; messageId: string }[]) {
    if (targets.length > 50) throw new ValidationError("At most 50 messages are allowed.");
    const ids = [...new Set(targets.map((target) => target.messageId))];
    if (!ids.length) return [];
    const thread = alias(messagingMessages, "thread");
    // Reads the messages and their thread roots together; each row must be visible.
    const rows = await selectMessages(db, scope)
      .innerJoin(
        messagingConversations,
        eq(messagingConversations.id, messagingMessages.conversationId),
      )
      .where(
        and(
          or(
            inArray(messagingMessages.id, ids),
            inArray(
              messagingMessages.id,
              db
                .select({ id: thread.threadId })
                .from(thread)
                .where(and(inArray(thread.id, ids), isNotNull(thread.threadId))),
            ),
          ),
          visibleConversations(db, scope),
        ),
      );
    const byId = new Map(rows.map((row) => [row.message.id, row]));
    const found = new Map<string, { target: (typeof rows)[number]; root: (typeof rows)[number] }>();
    for (const { conversationId, messageId } of targets) {
      const target = byId.get(messageId);
      if (!target || target.message.conversationId !== conversationId) continue;
      const root = target.message.threadId ? byId.get(target.message.threadId) : target;
      if (root) found.set(messageId, { target, root });
    }
    if (!found.size) return [];
    const shown = [...new Set([...found.values()].flatMap(({ target, root }) => [target, root]))];
    const conversationIds = [...new Set(shown.map((row) => row.message.conversationId))];
    const views = new Map(
      (await messageViews(db, scope, context.scope.actorEntityId, conversationIds, shown)).map(
        (view) => [view.id, view],
      ),
    );
    return [...found.values()].map(({ target, root }) => ({
      message: views.get(target.message.id)!,
      root: views.get(root.message.id)!,
    }));
  }
  return {
    messagePage: (messageIds: string[]) => messagePage(context, scope, messageIds),
    async createTaskFromMessage(input: CreateTaskInput & { requestId: string; messageId: string }) {
      return transaction(async (ctx) => {
        // The message must be visible and live. A task discussion is visible with view access.
        const { conversation, message } = await requireMessage(ctx.db, scope, input.messageId);
        if (message.deletedAt) throw new AccessDeniedError();
        if (conversation.organizationId !== scope.organizationId) throw new AccessDeniedError();
        const project = await ctx.requireAccess(input.projectEntityId, "edit");
        const fingerprint = requestFingerprint({
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
        // The request claim makes retries and simultaneous submissions create one task.
        const existing = await previousRequest(
          ctx,
          "task_from_message",
          input.requestId,
          fingerprint,
        );
        if (existing) return taskRepository(ctx).get(existing);
        const task = await createTaskInProject(ctx, project, input);
        await recordTaskSource(
          ctx,
          { messageId: input.messageId, conversationId: conversation.id },
          task,
        );
        await recordRequest(ctx, "task_from_message", input.requestId, task.entityId);
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
      const message = {
        messageId: messagingMessages.id,
        conversationId: messagingConversations.id,
        conversationName: messagingConversations.name,
        body: sql<string>`case when ${messagingMessages.deletedAt} is null then ${messagingMessages.body} else '' end`,
        deletedAt: messagingMessages.deletedAt,
        threadId: messagingMessages.threadId,
        authorName: joinedActorName(),
        authorImage: joinedActorPicture(scope.userId),
        authorType: actors.type,
        createdAt: messagingMessages.createdAt,
        replyCount: sql<number>`(select count(*)::int from ${messagingMessages} replies where replies.conversation_id = ${messagingMessages.conversationId} and replies.thread_id = coalesce(${messagingMessages.threadId}, ${messagingMessages.id}))`,
      };
      const references = db
        .select({
          ...message,
          purpose: sql<
            "source" | "mention" | "association" | "discussion"
          >`${messageEntityReferences.purpose}`,
        })
        .from(messageEntityReferences)
        .$dynamic();
      const referenced = await joinActorProfile(
        joinReferenceMessages(references),
        scope.organizationId,
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
        .orderBy(desc(messagingMessages.createdAt), desc(messagingMessages.id))
        .limit(relatedLimit);
      // Keep the newest discussions and show them oldest first.
      const newestFirst = (a: (typeof referenced)[number], b: (typeof referenced)[number]) => {
        const time = b.createdAt.getTime() - a.createdAt.getTime();
        if (time !== 0 || a.messageId === b.messageId) return time;
        return a.messageId < b.messageId ? 1 : -1;
      };
      const chronological = (rows: typeof referenced) =>
        // The renderer types this result with an ES2022 library, so no toSorted here.
        [...rows].sort(newestFirst).slice(0, relatedLimit).reverse();
      if (!projectTasks) return chronological(referenced);
      // A project's discussions also include the threads of its tasks' own discussions. Those
      // messages belong to the task by their conversation, so they have no reference row.
      const taskThreads = await joinActorProfile(
        db
          .select({
            ...message,
            conversationName: tasks.title,
            purpose: sql<"discussion">`'discussion'`,
          })
          .from(messagingMessages)
          .innerJoin(
            messagingConversations,
            eq(messagingConversations.id, messagingMessages.conversationId),
          )
          .innerJoin(tasks, eq(tasks.entityId, messagingConversations.taskEntityId))
          .innerJoin(actors, eq(actors.entityId, messagingMessages.authorActorEntityId))
          .$dynamic(),
        scope.organizationId,
      )
        .where(
          and(
            eq(messagingConversations.organizationId, scope.organizationId),
            inArray(messagingConversations.taskEntityId, projectTasks),
            isNull(messagingMessages.threadId),
            isNull(messagingMessages.deletedAt),
            visibleConversations(db, scope),
          ),
        )
        .orderBy(desc(messagingMessages.createdAt), desc(messagingMessages.id))
        .limit(relatedLimit);
      return chronological([...referenced, ...taskThreads]);
    },
    messageTargets,
    async messageTarget(conversationId: string, messageId: string) {
      const [target] = await messageTargets([{ conversationId, messageId }]);
      if (!target) throw new AccessDeniedError();
      return target;
    },
    search: (input: Parameters<typeof contextSearch>[2], signal?: AbortSignal) =>
      contextSearch(context, scope, input, signal),
    recordLabels: (ids: string[]) => recordLabels(context, scope, ids),
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
    messageTargets: (...args: Parameters<Repository["messageTargets"]>) =>
      run((repo) => repo.messageTargets(...args)),
    search: (...args: Parameters<Repository["search"]>) => run((repo) => repo.search(...args)),
  };
}
