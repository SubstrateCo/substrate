import type { DatabaseExecutor } from "../../client";
import { actors } from "../../core/actors/schema";
import { user } from "../../core/authentication/schema";
import { member } from "../../core/organizations/schema";
import { visibilityCte } from "../../core/permissions/visibility";
import { ConflictError, AccessDeniedError } from "../../errors";
import { recordTaskActivity } from "../activity/events";
import { requireMessage, visibleConversations, type MessagingIdentity } from "../messaging/access";
import { messagingConversations, messagingMessages } from "../messaging/schema";
import type { CreateTaskInput } from "../tasks/contracts";
import { taskRepository } from "../tasks/repository";
import { tasks } from "../tasks/tasks.schema";
import { workspaceContext, requireWork } from "./access";
import { messagePeople, messageWorkLinks } from "./message-metadata";
import { messagePage } from "./message-page";
import { messageEntityReferences, sourceTaskRequests } from "./schema";
import { contextSearch } from "./search";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";

export function createContextService(db: DatabaseExecutor, scope: MessagingIdentity) {
  return {
    messagePage: (messageIds: string[]) => messagePage(db, scope, messageIds),
    async createTaskFromMessage(input: CreateTaskInput & { requestId: string; messageId: string }) {
      return db.transaction(async (tx) => {
        const ctx = await workspaceContext(tx, scope);
        const { conversation } = await requireMessage(tx, scope, input.messageId);
        if (conversation.organizationId !== scope.organizationId) throw new AccessDeniedError();
        await ctx.requireAccess(input.projectEntityId, "edit", true);
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
        const task = await taskRepository(ctx).create(input);
        await tx.insert(messageEntityReferences).values({
          organizationId: scope.organizationId,
          conversationId: conversation.id,
          messageId: input.messageId,
          entityId: task.entityId,
          entityType: "task",
          purpose: "source",
          createdByActorEntityId: ctx.scope.actorEntityId,
        });
        await tx.insert(sourceTaskRequests).values({
          organizationId: scope.organizationId,
          actorEntityId: ctx.scope.actorEntityId,
          requestId: input.requestId,
          fingerprint,
          taskEntityId: task.entityId,
        });
        await recordTaskActivity(ctx, task.entityId, "Created from a discussion", input.messageId);
        return task;
      });
    },
    async attach(messageId: string, entityId: string) {
      return db.transaction(async (tx) => {
        const ctx = await workspaceContext(tx, scope);
        const { conversation } = await requireMessage(tx, scope, messageId);
        if (conversation.organizationId !== scope.organizationId) throw new AccessDeniedError();
        const work = await requireWork(ctx, entityId, "edit");
        const rows = await tx
          .insert(messageEntityReferences)
          .values({
            organizationId: scope.organizationId,
            conversationId: conversation.id,
            messageId,
            entityId,
            entityType: work.entityType,
            purpose: "association",
            createdByActorEntityId: ctx.scope.actorEntityId,
          })
          .onConflictDoNothing()
          .returning();
        if (rows.length && work.entityType === "task")
          await recordTaskActivity(ctx, entityId, "Discussion linked", messageId);
        return rows.length > 0;
      });
    },
    async detach(messageId: string, entityId: string) {
      return db.transaction(async (tx) => {
        const ctx = await workspaceContext(tx, scope);
        await requireMessage(tx, scope, messageId);
        const work = await requireWork(ctx, entityId);
        const [reference] = await tx
          .select()
          .from(messageEntityReferences)
          .where(
            and(
              eq(messageEntityReferences.messageId, messageId),
              eq(messageEntityReferences.entityId, entityId),
              eq(messageEntityReferences.organizationId, scope.organizationId),
              eq(messageEntityReferences.purpose, "association"),
            ),
          );
        if (!reference) return false;
        if (reference.createdByActorEntityId !== ctx.scope.actorEntityId)
          await requireWork(ctx, entityId, "owner");
        const rows = await tx
          .delete(messageEntityReferences)
          .where(
            and(
              eq(messageEntityReferences.messageId, messageId),
              eq(messageEntityReferences.entityId, entityId),
              eq(messageEntityReferences.purpose, "association"),
            ),
          )
          .returning();
        if (rows.length && work.entityType === "task")
          await recordTaskActivity(ctx, entityId, "Discussion unlinked", messageId);
        return rows.length > 0;
      });
    },
    async messageLinks(messageId: string) {
      const ctx = await workspaceContext(db, scope);
      const { conversation } = await requireMessage(db, scope, messageId);
      if (conversation.organizationId !== scope.organizationId) return [];
      return (await messageWorkLinks(ctx, [messageId])).get(messageId) ?? [];
    },
    async messagePeople(messageId: string) {
      await workspaceContext(db, scope);
      const { message } = await requireMessage(db, scope, messageId);
      return (await messagePeople(db, scope, [message])).get(messageId)!;
    },
    async related(entityId: string) {
      const ctx = await workspaceContext(db, scope);
      const work = await requireWork(ctx, entityId);
      const projectTasks =
        work.entityType === "project"
          ? db
              .select({ entityId: tasks.entityId })
              .from(tasks)
              .where(
                and(
                  eq(tasks.organizationId, scope.organizationId),
                  eq(tasks.projectEntityId, entityId),
                  inArray(
                    tasks.entityId,
                    sql`(${visibilityCte(ctx.scope)} SELECT entity_id FROM visible_entities)`,
                  ),
                ),
              )
          : undefined;
      return db
        .select({
          messageId: messagingMessages.id,
          conversationId: messagingConversations.id,
          conversationName: messagingConversations.name,
          body: messagingMessages.body,
          threadId: messagingMessages.threadId,
          authorName: sql<string>`case when ${actors.type} = 'agent' then ${actors.name} else ${user.name} end`,
          authorType: sql<"human" | "agent">`coalesce(${actors.type}, 'human')`,
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
        .leftJoin(actors, eq(actors.entityId, messagingMessages.authorActorEntityId))
        .leftJoin(user, eq(user.id, messagingMessages.authorId))
        .where(
          and(
            eq(messageEntityReferences.organizationId, scope.organizationId),
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
      await workspaceContext(db, scope);
      const { message } = await requireMessage(db, scope, messageId);
      if (message.conversationId !== conversationId) throw new AccessDeniedError();
      const root = message.threadId
        ? (await requireMessage(db, scope, message.threadId)).message
        : message;
      const decorate = async (row: typeof message) => {
        const [author] = row.authorId
          ? await db
              .select({
                name: user.name,
                external: sql<boolean>`not exists (
              select 1 from ${member}
              where ${member.userId} = ${row.authorId}
                and ${member.organizationId} = ${scope.organizationId}
            )`,
              })
              .from(user)
              .where(eq(user.id, row.authorId))
          : [];
        const [agentAuthor] = row.authorActorEntityId
          ? await db
              .select({ name: actors.name, type: actors.type })
              .from(actors)
              .where(eq(actors.entityId, row.authorActorEntityId))
          : [];
        return {
          ...row,
          authorName: agentAuthor?.type === "agent" ? agentAuthor.name : (author?.name ?? "Member"),
          authorType: agentAuthor?.type ?? ("human" as const),
          authorExternal: agentAuthor?.type === "agent" ? false : (author?.external ?? true),
          reactions: [],
          replyCount: 0,
        };
      };
      return { message: await decorate(message), root: await decorate(root) };
    },
    search: (input: Parameters<typeof contextSearch>[2]) => contextSearch(db, scope, input),
  };
}
