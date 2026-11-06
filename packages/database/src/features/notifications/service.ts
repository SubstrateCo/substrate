import { and, desc, eq, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "../../client";
import { actors } from "../../core/actors/schema";
import { AccessDeniedError } from "../../errors";
import { workspaceContext, requireWork } from "../context/access";
import { requireMessage, type MessagingIdentity } from "../messaging/access";
import { taskActivity } from "../activity/schema";
import { notifications } from "./schema";

export function createFeedService(db: DatabaseExecutor, scope: MessagingIdentity) {
  return {
    async activity(taskEntityId: string) {
      const ctx = await workspaceContext(db, scope);
      const work = await requireWork(ctx, taskEntityId);
      if (work.entityType !== "task") throw new AccessDeniedError();
      const rows = await db
        .select({
          id: taskActivity.id,
          action: taskActivity.action,
          actorName: actors.name,
          createdAt: taskActivity.createdAt,
          sourceMessageId: taskActivity.sourceMessageId,
        })
        .from(taskActivity)
        .innerJoin(actors, eq(actors.entityId, taskActivity.actorEntityId))
        .where(
          and(
            eq(taskActivity.organizationId, scope.organizationId),
            eq(taskActivity.taskEntityId, taskEntityId),
          ),
        )
        .orderBy(desc(taskActivity.createdAt), desc(taskActivity.id))
        .limit(100);
      const result = [];
      for (const { sourceMessageId, ...event } of rows) {
        try {
          if (sourceMessageId) await requireMessage(db, scope, sourceMessageId);
          result.push(event);
        } catch (error) {
          if (!(error instanceof AccessDeniedError)) throw error;
        }
      }
      return result;
    },
    async list(after?: string) {
      const ctx = await workspaceContext(db, scope);
      let boundary;
      if (after) {
        const [anchor] = await db
          .select()
          .from(notifications)
          .where(
            and(
              eq(notifications.id, after),
              eq(notifications.recipientActorEntityId, ctx.scope.actorEntityId),
            ),
          );
        if (!anchor) throw new AccessDeniedError();
        boundary = sql`(${notifications.createdAt}, ${notifications.id}) < (select anchor.created_at, anchor.id from ${notifications} anchor where anchor.id = ${anchor.id}::uuid)`;
      }
      const rows = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.organizationId, scope.organizationId),
            eq(notifications.recipientActorEntityId, ctx.scope.actorEntityId),
            boundary,
          ),
        )
        .orderBy(desc(notifications.createdAt), desc(notifications.id))
        .limit(100);
      const result = [];
      for (const row of rows) {
        try {
          if (row.entityId) {
            const work = await requireWork(ctx, row.entityId);
            result.push({
              id: row.id,
              kind: row.kind,
              readAt: row.readAt,
              createdAt: row.createdAt,
              title: work.title,
              entityId: row.entityId,
              projectEntityId: work.projectEntityId,
              conversationId: null,
              messageId: null,
            });
          } else {
            const { message, conversation } = await requireMessage(db, scope, row.messageId!);
            result.push({
              id: row.id,
              kind: row.kind,
              readAt: row.readAt,
              createdAt: row.createdAt,
              title: row.kind === "mention" ? "You were mentioned" : "New thread reply",
              entityId: null,
              projectEntityId: null,
              conversationId: conversation.id,
              messageId: message.id,
            });
          }
        } catch (error) {
          if (!(error instanceof AccessDeniedError)) throw error;
        }
      }
      return result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
    async markRead(id: string) {
      const ctx = await workspaceContext(db, scope);
      const [row] = await db
        .update(notifications)
        .set({ readAt: sql`coalesce(${notifications.readAt}, now())` })
        .where(
          and(
            eq(notifications.id, id),
            eq(notifications.organizationId, scope.organizationId),
            eq(notifications.recipientActorEntityId, ctx.scope.actorEntityId),
          ),
        )
        .returning({ id: notifications.id });
      if (!row) throw new AccessDeniedError();
      return row;
    },
  };
}
