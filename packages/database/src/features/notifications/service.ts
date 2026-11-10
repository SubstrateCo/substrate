import type { DatabaseExecutor } from "../../client";
import { actorDisplayName } from "../../core/actors/display-name";
import { actors } from "../../core/actors/schema";
import { AccessDeniedError } from "../../errors";
import { taskActivity } from "../activity/schema";
import { workspaceContext, requireWork } from "../context/access";
import { visibleConversations, type MessagingIdentity } from "../messaging/access";
import { messagingConversations, messagingMessages } from "../messaging/schema";
import { projects } from "../projects/schema";
import { liveTask } from "../tasks/access";
import { tasks } from "../tasks/tasks.schema";
import { toFeedItem } from "./feed-item";
import { notifications } from "./schema";
import { readableMessageTargets } from "./targets";
import { and, desc, eq, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";

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
          actorName: actorDisplayName(),
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
      return rows.flatMap((row) => {
        const message = row.sourceMessageId ? messages.get(row.sourceMessageId) : undefined;
        if (row.sourceMessageId && !message) return [];
        return [
          {
            id: row.id,
            action: row.action,
            actorName: row.actorName,
            actorType: row.actorType,
            createdAt: row.createdAt,
            source: message
              ? {
                  messageId: message.id,
                  conversationId: message.conversationId,
                  conversationName: message.conversationName,
                }
              : null,
          },
        ];
      });
    },
    async list(
      after?: string,
      { limit = 100, unread = false }: { limit?: number; unread?: boolean } = {},
    ) {
      const { context: ctx } = await workspaceContext(db, scope);
      let boundary: SQL | undefined;
      if (after) {
        const [anchor] = await db
          .select()
          .from(notifications)
          .where(
            and(
              eq(notifications.id, after),
              eq(notifications.organizationId, scope.organizationId),
              eq(notifications.recipientActorEntityId, ctx.scope.actorEntityId),
            ),
          );
        if (!anchor) throw new AccessDeniedError();
        boundary = sql`(${notifications.createdAt}, ${notifications.id}) < (select anchor.created_at, anchor.id from ${notifications} anchor where anchor.id = ${anchor.id}::uuid)`;
      }
      // One statement filters by the target's current access before LIMIT, so hidden targets
      // cost no extra round trips. A task is readable when its project is and it is not deleted.
      const projectEntityId = sql`coalesce(${tasks.projectEntityId}, ${projects.entityId})`;
      const rows = await db
        .select({
          id: notifications.id,
          kind: notifications.kind,
          readAt: notifications.readAt,
          createdAt: notifications.createdAt,
          entityId: notifications.entityId,
          messageId: notifications.messageId,
          title: sql<string | null>`coalesce(${tasks.title}, ${projects.name})`,
          projectEntityId: sql<string | null>`${projectEntityId}`,
          conversationId: messagingConversations.id,
        })
        .from(notifications)
        .leftJoin(
          tasks,
          and(
            eq(tasks.organizationId, notifications.organizationId),
            eq(tasks.entityId, notifications.entityId),
          ),
        )
        .leftJoin(
          projects,
          and(
            eq(projects.organizationId, notifications.organizationId),
            eq(projects.entityId, notifications.entityId),
          ),
        )
        .leftJoin(
          messagingMessages,
          and(isNull(notifications.entityId), eq(messagingMessages.id, notifications.messageId)),
        )
        .leftJoin(
          messagingConversations,
          eq(messagingConversations.id, messagingMessages.conversationId),
        )
        .where(
          and(
            eq(notifications.organizationId, scope.organizationId),
            eq(notifications.recipientActorEntityId, ctx.scope.actorEntityId),
            unread ? isNull(notifications.readAt) : undefined,
            boundary,
            or(
              and(
                isNotNull(notifications.entityId),
                ctx.readable(projectEntityId),
                or(isNull(tasks.entityId), liveTask()),
              ),
              and(
                isNull(notifications.entityId),
                isNotNull(messagingConversations.id),
                visibleConversations(db, scope),
              ),
            ),
          ),
        )
        .orderBy(desc(notifications.createdAt), desc(notifications.id))
        .limit(limit);
      return rows.flatMap(
        ({ title, projectEntityId, ...row }) =>
          toFeedItem({
            ...row,
            work: title !== null && projectEntityId !== null ? { title, projectEntityId } : null,
          }) ?? [],
      );
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
