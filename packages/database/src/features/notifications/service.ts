import type { DatabaseExecutor } from "../../client";
import { actorDisplayName } from "../../core/actors/display-name";
import { actors } from "../../core/actors/schema";
import { AccessDeniedError } from "../../errors";
import { taskActivity } from "../activity/schema";
import { workspaceContext, requireWork } from "../context/access";
import { messageExcerpts } from "../context/message-excerpt";
import { visibleConversations, type MessagingIdentity } from "../messaging/access";
import { conversationDisplayName } from "../messaging/display-name";
import { messagingConversations, messagingMessages } from "../messaging/schema";
import { projects } from "../projects/schema";
import { liveTask } from "../tasks/access";
import { tasks } from "../tasks/tasks.schema";
import { toFeedItem } from "./feed-item";
import { notifications } from "./schema";
import { readableMessageTargets } from "./targets";
import { and, desc, eq, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

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
      // Who acted: the message author, or whoever recorded the assignment event.
      const actor = alias(actors, "notice_actor");
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
          projectName: sql<
            string | null
          >`(SELECT notice_project.name FROM ${projects} notice_project
            WHERE notice_project.organization_id = ${notifications.organizationId}
              AND notice_project.entity_id = ${projectEntityId})`,
          conversationId: messagingConversations.id,
          conversationName: sql<
            string | null
          >`CASE WHEN ${messagingConversations.id} IS NULL THEN NULL ELSE ${conversationDisplayName(db, scope)} END`,
          conversationKind: messagingConversations.kind,
          conversationPrivate: messagingConversations.private,
          threadId: messagingMessages.threadId,
          body: messagingMessages.body,
          actorName: sql<string | null>`CASE WHEN ${actor.entityId} IS NULL THEN NULL
            ELSE ${actorDisplayName(actor)} END`,
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
        .leftJoin(
          taskActivity,
          and(
            eq(notifications.kind, "assignment"),
            eq(taskActivity.organizationId, notifications.organizationId),
            eq(taskActivity.taskEntityId, notifications.entityId),
            sql`${taskActivity.id}::text = ${notifications.eventKey}`,
          ),
        )
        .leftJoin(
          actor,
          eq(
            actor.entityId,
            sql`coalesce(${messagingMessages.authorActorEntityId}, ${taskActivity.actorEntityId})`,
          ),
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
      // The query above checked each message's conversation, so its body may be quoted.
      const excerpts = await messageExcerpts(
        ctx,
        db,
        scope,
        rows.flatMap((row) =>
          row.messageId && row.conversationId && row.body !== null
            ? [{ id: row.messageId, body: row.body, conversationId: row.conversationId }]
            : [],
        ),
      );
      return rows.flatMap(
        ({
          title,
          projectEntityId,
          projectName,
          conversationName,
          conversationKind,
          conversationPrivate,
          ...row
        }) =>
          toFeedItem({
            ...row,
            work:
              title !== null && projectEntityId !== null
                ? { title, projectEntityId, projectName: projectName ?? title }
                : null,
            conversation:
              row.conversationId && conversationName && conversationKind
                ? {
                    name: conversationName,
                    kind: conversationKind,
                    private: conversationPrivate ?? true,
                    excerpt: excerpts.get(row.messageId!) ?? "",
                  }
                : null,
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
