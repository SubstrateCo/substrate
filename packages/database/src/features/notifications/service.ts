import { realtimeKeys } from "@substrate/contracts/realtime";

import type { DatabaseExecutor } from "../../client";
import { actorDisplayName } from "../../core/actors/display-name";
import { actorPicture } from "../../core/actors/picture";
import { actors } from "../../core/actors/schema";
import { effectsFor } from "../../core/effects";
import type { RepositoryContext } from "../../core/repository-context";
import type { SessionIdentity } from "../../core/session/identity";
import { workspaceContext } from "../../core/session/workspace";
import { AccessDeniedError } from "../../errors";
import { taskActivity } from "../activity/schema";
import { requireWork } from "../context/access";
import { messageExcerpts } from "../context/message-excerpt";
import { visibleConversations } from "../messaging/access";
import { conversationDisplayName } from "../messaging/display-name";
import { messagingConversations, messagingMessages } from "../messaging/schema";
import { projects } from "../projects/schema";
import { taskComments } from "../tasks/comments.schema";
import { tasks } from "../tasks/tasks.schema";
import { toFeedItem } from "./feed-item";
import { createNotificationGroups } from "./groups";
import { notifications } from "./schema";
import { readableMessageTargets } from "./targets";
import { and, desc, eq, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

export function createFeedService(db: DatabaseExecutor, scope: SessionIdentity) {
  const service = {
    async activity(taskEntityId: string) {
      const { context: ctx } = await workspaceContext(db, scope);
      const work = await requireWork(ctx, taskEntityId);
      if (work.entityType !== "task") throw new AccessDeniedError();
      const rows = await db
        .select({
          id: taskActivity.id,
          action: taskActivity.action,
          actorName: actorDisplayName(),
          actorImage: actorPicture(scope),
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
            actorImage: row.actorImage,
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
      {
        limit = 100,
        unread = false,
        ids,
        context,
      }: { limit?: number; unread?: boolean; ids?: string[]; context?: RepositoryContext } = {},
    ) {
      const ctx = context ?? (await workspaceContext(db, scope)).context;
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
      // cost no extra round trips.
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
          actorImage: actorPicture(scope, actor),
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
          taskComments,
          and(
            eq(notifications.kind, "mention"),
            eq(taskComments.organizationId, notifications.organizationId),
            eq(taskComments.taskEntityId, notifications.entityId),
            sql`${taskComments.id}::text = ${notifications.eventKey}`,
          ),
        )
        .leftJoin(
          actor,
          eq(
            actor.entityId,
            sql`coalesce(${messagingMessages.authorActorEntityId}, ${taskActivity.actorEntityId}, ${taskComments.authorActorEntityId})`,
          ),
        )
        .where(
          and(
            eq(notifications.organizationId, scope.organizationId),
            eq(notifications.recipientActorEntityId, ctx.scope.actorEntityId),
            unread ? isNull(notifications.readAt) : undefined,
            ids ? inArray(notifications.id, ids) : undefined,
            boundary,
            or(
              and(isNotNull(notifications.entityId), ctx.readable(notifications.entityId)),
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
      const changed = await db
        .update(notifications)
        .set({ readAt: sql`now()` })
        .where(
          and(
            eq(notifications.organizationId, scope.organizationId),
            eq(notifications.recipientActorEntityId, ctx.scope.actorEntityId),
            isNull(notifications.readAt),
          ),
        )
        .returning({ id: notifications.id });
      if (changed.length)
        effectsFor(db).hint({ audience: realtimeKeys.user(scope.userId), domain: "notifications" });
    },
    async markRead(id: string) {
      const { context: ctx } = await workspaceContext(db, scope);
      const [existing] = await db
        .select({ id: notifications.id })
        .from(notifications)
        .where(
          and(
            eq(notifications.id, id),
            eq(notifications.organizationId, scope.organizationId),
            eq(notifications.recipientActorEntityId, ctx.scope.actorEntityId),
          ),
        );
      if (!existing) throw new AccessDeniedError();
      const [row] = await db
        .update(notifications)
        .set({ readAt: sql`coalesce(${notifications.readAt}, now())` })
        .where(
          and(
            eq(notifications.id, id),
            eq(notifications.organizationId, scope.organizationId),
            eq(notifications.recipientActorEntityId, ctx.scope.actorEntityId),
            isNull(notifications.readAt),
          ),
        )
        .returning({ id: notifications.id });
      if (row)
        effectsFor(db).hint({ audience: realtimeKeys.user(scope.userId), domain: "notifications" });
      return existing;
    },
  };
  return {
    ...service,
    ...createNotificationGroups(db, scope, (ids, context) =>
      service.list(undefined, { ids, context, limit: ids.length }),
    ),
  };
}
