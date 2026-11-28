import { shouldAlert } from "@substrate/contracts/notifications/alerts";
import { realtimeKeys } from "@substrate/contracts/realtime";

import { joinedActorAvatar } from "../../core/actors/avatar";
import {
  joinActorProfile,
  joinedActorName,
  joinedActorPicture,
} from "../../core/actors/joined-profile";
import { actors } from "../../core/actors/schema";
import { effectsFor } from "../../core/effects";
import type { DatabaseExecutor } from "../../core/executor";
import type { RepositoryContext } from "../../core/repository-context";
import type { SessionIdentity } from "../../core/session/identity";
import { workspaceContext } from "../../core/session/workspace";
import { AccessDeniedError } from "../../errors";
import { taskActivity } from "../activity/schema";
import { messageExcerpts } from "../context/message-references/message-excerpt";
import { visibleConversations } from "../messaging/access";
import { conversationDisplayName } from "../messaging/display-name";
import {
  messagingConversations,
  messagingMessages,
  messagingParticipants,
} from "../messaging/schema";
import { projects } from "../projects/schema";
import { taskRepository } from "../tasks/repository";
import { tasks } from "../tasks/tasks.schema";
import { toFeedItem } from "./feed-item";
import { createNotificationGroups } from "./groups";
import {
  accountColumns,
  accountJoin,
  toAccount,
  toConversation,
  toWorkspace,
  workspaceColumns,
  workspaceJoin,
} from "./preferences";
import { notificationPreferences, notificationWorkspacePreferences } from "./preferences.schema";
import { notifications } from "./schema";
import { readableMessageTargets } from "./targets";
import { and, desc, eq, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

export function createFeedRepository(ctx: RepositoryContext, scope: SessionIdentity) {
  const { db } = ctx;
  const service = {
    async activity(taskEntityId: string) {
      await taskRepository(ctx).get(taskEntityId);
      const events = db
        .select({
          id: taskActivity.id,
          action: taskActivity.action,
          actorName: joinedActorName(),
          actorImage: joinedActorPicture(),
          actorAvatar: joinedActorAvatar(),
          actorType: actors.type,
          createdAt: taskActivity.createdAt,
          sourceMessageId: taskActivity.sourceMessageId,
        })
        .from(taskActivity)
        .innerJoin(actors, eq(actors.entityId, taskActivity.actorEntityId))
        .$dynamic();
      const rows = await joinActorProfile(events, scope.organizationId)
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
            actorAvatar: row.actorAvatar,
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
      }: { limit?: number; unread?: boolean; ids?: string[] } = {},
    ) {
      let boundary: SQL | undefined;
      if (after) {
        const [anchor] = await db
          .select({ id: notifications.id, at: sql<string>`${notifications.createdAt}::text` })
          .from(notifications)
          .where(
            and(
              eq(notifications.id, after),
              eq(notifications.organizationId, scope.organizationId),
              eq(notifications.recipientActorEntityId, ctx.scope.actorEntityId),
            ),
          );
        // A deleted message removes its notification. Restart the authorized feed when its cursor
        // vanished; never resolve an anchor owned by another recipient or workspace.
        if (anchor)
          boundary = sql`(${notifications.createdAt}, ${notifications.id}) < (${anchor.at}::timestamptz, ${anchor.id}::uuid)`;
      }
      // One statement filters by the target's current access before LIMIT, so hidden targets
      // cost no extra round trips.
      const projectEntityId = sql`coalesce(${tasks.projectEntityId}, ${projects.entityId})`;
      // Who acted: the message author, or whoever recorded the assignment event.
      const actor = alias(actors, "notice_actor");
      const noticeProject = alias(projects, "notice_project");
      const ownParticipant = alias(messagingParticipants, "own_participant");
      const notices = db
        .select({
          id: notifications.id,
          kind: notifications.kind,
          readAt: notifications.readAt,
          createdAt: notifications.createdAt,
          entityId: notifications.entityId,
          messageId: notifications.messageId,
          title: sql<string | null>`coalesce(${tasks.title}, ${projects.name})`,
          projectEntityId: sql<string | null>`${projectEntityId}`,
          projectName: noticeProject.name,
          conversationId: messagingConversations.id,
          conversationName: sql<
            string | null
          >`CASE WHEN ${messagingConversations.id} IS NULL THEN NULL ELSE ${conversationDisplayName(db, scope)} END`,
          conversationKind: messagingConversations.kind,
          conversationPrivate: messagingConversations.private,
          threadId: messagingMessages.threadId,
          body: messagingMessages.body,
          // Null when the notice has no actor.
          actorName: sql<string | null>`${joinedActorName(actor)}`,
          actorImage: joinedActorPicture(actor),
          actorAvatar: joinedActorAvatar(actor),
          // The recipient's settings decide the alert flag. Each join matches at most one row.
          accountPreferences: accountColumns,
          workspacePreferences: workspaceColumns,
          conversationPreferences: {
            level: ownParticipant.notificationLevel,
            mutedUntil: ownParticipant.notificationsMutedUntil,
          },
        })
        .from(notifications)
        .leftJoin(notificationPreferences, accountJoin(scope.userId))
        .leftJoin(notificationWorkspacePreferences, workspaceJoin(scope))
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
          noticeProject,
          and(
            eq(noticeProject.organizationId, notifications.organizationId),
            eq(noticeProject.entityId, projectEntityId),
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
          ownParticipant,
          and(
            eq(ownParticipant.conversationId, messagingConversations.id),
            eq(ownParticipant.actorEntityId, ctx.scope.actorEntityId),
            isNull(ownParticipant.leftAt),
          ),
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
        .$dynamic();
      const rows = await joinActorProfile(notices, scope.organizationId, actor)
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
                isNull(messagingMessages.deletedAt),
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
      const account = toAccount(rows[0]?.accountPreferences);
      const workspace = toWorkspace(rows[0]?.workspacePreferences);
      const now = new Date();
      return rows.flatMap(
        ({
          title,
          projectEntityId,
          projectName,
          conversationName,
          conversationKind,
          conversationPrivate,
          accountPreferences: _account,
          workspacePreferences: _workspace,
          conversationPreferences,
          ...row
        }) =>
          toFeedItem({
            ...row,
            alert: shouldAlert({
              kind: row.kind,
              conversationKind: row.entityId ? null : conversationKind,
              conversation: toConversation(conversationPreferences),
              workspace,
              account,
              now,
            }),
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
      const key = and(
        eq(notifications.id, id),
        eq(notifications.organizationId, scope.organizationId),
        eq(notifications.recipientActorEntityId, ctx.scope.actorEntityId),
      );
      const [result] = await db.execute<{ allowed: boolean; changed: boolean }>(sql`
        WITH updated AS (
          UPDATE ${notifications} SET read_at = now()
          WHERE ${key} AND ${notifications.readAt} IS NULL RETURNING id
        )
        SELECT EXISTS (SELECT 1 FROM ${notifications} WHERE ${key}) AS allowed,
          EXISTS (SELECT 1 FROM updated) AS changed
      `);
      if (!result?.allowed) throw new AccessDeniedError();
      if (result.changed)
        effectsFor(db).hint({ audience: realtimeKeys.user(scope.userId), domain: "notifications" });
      return { id };
    },
  };
  return {
    ...service,
    ...createNotificationGroups(ctx, scope, (ids) =>
      service.list(undefined, { ids, limit: ids.length }),
    ),
  };
}

// Trusted non-HTTP entry point. HTTP handlers use the middleware's scoped repository instead.
export function createFeedService(db: DatabaseExecutor, scope: SessionIdentity) {
  type Repository = ReturnType<typeof createFeedRepository>;
  const run = async <T>(work: (repository: Repository) => Promise<T>) => {
    const { context } = await workspaceContext(db, scope);
    return work(createFeedRepository(context, scope));
  };
  return {
    activity: (...args: Parameters<Repository["activity"]>) =>
      run((repo) => repo.activity(...args)),
    list: (...args: Parameters<Repository["list"]>) => run((repo) => repo.list(...args)),
    markAllRead: () => run((repo) => repo.markAllRead()),
    markRead: (...args: Parameters<Repository["markRead"]>) =>
      run((repo) => repo.markRead(...args)),
    groups: (...args: Parameters<Repository["groups"]>) => run((repo) => repo.groups(...args)),
    groupEvents: (...args: Parameters<Repository["groupEvents"]>) =>
      run((repo) => repo.groupEvents(...args)),
    hasUnread: () => run((repo) => repo.hasUnread()),
    markGroupRead: (...args: Parameters<Repository["markGroupRead"]>) =>
      run((repo) => repo.markGroupRead(...args)),
  };
}
