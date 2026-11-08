import type { DatabaseExecutor } from "../../client";
import { actors } from "../../core/actors/schema";
import { AccessDeniedError } from "../../errors";
import { taskActivity } from "../activity/schema";
import { workspaceContext, requireWork } from "../context/access";
import type { MessagingIdentity } from "../messaging/access";
import { notifications } from "./schema";
import { readableWorkTargets, readableMessageTargets } from "./targets";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

export function createFeedService(db: DatabaseExecutor, scope: MessagingIdentity) {
  return {
    async activity(taskEntityId: string) {
      const { context: ctx } = await workspaceContext(db, scope);
      const work = await requireWork(ctx, taskEntityId);
      if (work.entityType !== "task") throw new AccessDeniedError();
      const rows = await db
        .select({
          id: taskActivity.id,
          action: taskActivity.action,
          actorName: actors.name,
          actorType: actors.type,
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
      const messages = await readableMessageTargets(db, scope, [
        ...new Set(rows.flatMap((row) => (row.sourceMessageId ? [row.sourceMessageId] : []))),
      ]);
      return rows
        .filter((row) => !row.sourceMessageId || messages.has(row.sourceMessageId))
        .map((row) => ({
          id: row.id,
          action: row.action,
          actorName: row.actorName,
          actorType: row.actorType,
          createdAt: row.createdAt,
        }));
    },
    async list(after?: string) {
      const { context: ctx } = await workspaceContext(db, scope);
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
      const workTargets = await readableWorkTargets(ctx, [
        ...new Set(rows.flatMap((row) => (row.entityId ? [row.entityId] : []))),
      ]);
      const messageTargets = await readableMessageTargets(db, scope, [
        ...new Set(rows.flatMap((row) => (!row.entityId && row.messageId ? [row.messageId] : []))),
      ]);
      for (const row of rows) {
        if (row.entityId) {
          const work = workTargets.get(row.entityId);
          if (!work) continue;
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
          const message = messageTargets.get(row.messageId!);
          if (!message) continue;
          result.push({
            id: row.id,
            kind: row.kind,
            readAt: row.readAt,
            createdAt: row.createdAt,
            title: row.kind === "mention" ? "You were mentioned" : "New thread reply",
            entityId: null,
            projectEntityId: null,
            conversationId: message.conversationId,
            messageId: message.id,
          });
        }
      }
      return result;
    },
    async markAllRead() {
      const { context: ctx } = await workspaceContext(db, scope);
      await db
        .update(notifications)
        .set({ readAt: sql`now()` })
        .where(
          and(
            eq(notifications.organizationId, scope.organizationId),
            eq(notifications.recipientActorEntityId, ctx.scope.actorEntityId),
            isNull(notifications.readAt),
          ),
        );
    },
    async markRead(id: string) {
      const { context: ctx } = await workspaceContext(db, scope);
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
