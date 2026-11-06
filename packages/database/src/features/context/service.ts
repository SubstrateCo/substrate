import { and, asc, eq, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "../../client";
import { actors } from "../../core/actors/schema";
import { user } from "../../core/authentication/schema";
import { ConflictError, AccessDeniedError } from "../../errors";
import { recordTaskActivity } from "../activity/events";
import { requireMessage, visibleConversations, type MessagingIdentity } from "../messaging/access";
import { messagingConversations, messagingMessages } from "../messaging/schema";
import { taskRepository } from "../tasks/repository";
import type { CreateTaskInput } from "../tasks/contracts";
import { workspaceContext, requireWork } from "./access";
import { messageEntityReferences, sourceTaskRequests } from "./schema";
import { contextSearch } from "./search";
import { messageReferences } from "./references";

export function createContextService(db: DatabaseExecutor, scope: MessagingIdentity) {
  return {
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
        await tx
          .insert(messageEntityReferences)
          .values({
            organizationId: scope.organizationId,
            conversationId: conversation.id,
            messageId: input.messageId,
            entityId: task.entityId,
            entityType: "task",
            purpose: "source",
            createdByActorEntityId: ctx.scope.actorEntityId,
          });
        await tx
          .insert(sourceTaskRequests)
          .values({
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
        if (!reference) return;
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
      });
    },
    async messageLinks(messageId: string) {
      const ctx = await workspaceContext(db, scope);
      const { conversation } = await requireMessage(db, scope, messageId);
      if (conversation.organizationId !== scope.organizationId) return [];
      const references = await db
        .select()
        .from(messageEntityReferences)
        .where(eq(messageEntityReferences.messageId, messageId))
        .orderBy(asc(messageEntityReferences.createdAt));
      const result = [];
      for (const reference of references) {
        try {
          const work = await requireWork(ctx, reference.entityId);
          result.push({
            ...work,
            purpose: reference.purpose,
            canRemove:
              reference.purpose === "association" &&
              (reference.createdByActorEntityId === ctx.scope.actorEntityId ||
                (await ctx.requireAccess(work.entityId, "view")).level === "owner"),
          });
        } catch (error) {
          if (!(error instanceof AccessDeniedError)) throw error;
        }
      }
      return result;
    },
    async messagePeople(messageId: string) {
      const ctx = await workspaceContext(db, scope);
      const { message } = await requireMessage(db, scope, messageId);
      const result: { id: string; name: string }[] = [];
      for (const reference of messageReferences(message.body).filter(
        (item) => item.kind === "person",
      )) {
        try {
          await ctx.requireActiveActor(reference.id);
          const [actor] = await db
            .select()
            .from(actors)
            .where(
              and(
                eq(actors.entityId, reference.id),
                eq(actors.organizationId, scope.organizationId),
              ),
            );
          if (!actor?.userId) continue;
          const [visible] = await db
            .select({ id: messagingConversations.id })
            .from(messagingConversations)
            .where(
              and(
                eq(messagingConversations.id, message.conversationId),
                visibleConversations(db, {
                  userId: actor.userId,
                  organizationId: scope.organizationId,
                }),
              ),
            );
          if (visible) result.push({ id: reference.id, name: actor.name });
        } catch (error) {
          if (!(error instanceof AccessDeniedError)) throw error;
        }
      }
      return result;
    },
    async related(entityId: string) {
      const ctx = await workspaceContext(db, scope);
      await requireWork(ctx, entityId);
      return db
        .select({
          messageId: messagingMessages.id,
          conversationId: messagingConversations.id,
          conversationName: messagingConversations.name,
          body: messagingMessages.body,
          threadId: messagingMessages.threadId,
          authorName: sql<string>`(select name from "user" where id = ${messagingMessages.authorId})`,
          createdAt: messagingMessages.createdAt,
          purpose: messageEntityReferences.purpose,
        })
        .from(messageEntityReferences)
        .innerJoin(messagingMessages, eq(messagingMessages.id, messageEntityReferences.messageId))
        .innerJoin(
          messagingConversations,
          eq(messagingConversations.id, messageEntityReferences.conversationId),
        )
        .where(
          and(
            eq(messageEntityReferences.organizationId, scope.organizationId),
            eq(messageEntityReferences.entityId, entityId),
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
        const [author] = await db
          .select({ name: user.name })
          .from(user)
          .where(eq(user.id, row.authorId));
        return { ...row, authorName: author?.name ?? "Member", reactions: [], replyCount: 0 };
      };
      return { message: await decorate(message), root: await decorate(root) };
    },
    search: (input: Parameters<typeof contextSearch>[2]) => contextSearch(db, scope, input),
  };
}
