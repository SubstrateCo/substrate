import { notificationPosition } from "@substrate/contracts/context/notification-groups";

import type { DatabaseExecutor } from "../../client";
import type { RepositoryContext } from "../../core/repository-context";
import { AccessDeniedError } from "../../errors";
import { taskActivity } from "../activity/schema";
import { workspaceContext } from "../context/access";
import { visibleConversations, type MessagingIdentity } from "../messaging/access";
import { messagingConversations, messagingMessages } from "../messaging/schema";
import { projects } from "../projects/schema";
import { liveTask } from "../tasks/access";
import { taskComments } from "../tasks/comments.schema";
import { tasks } from "../tasks/tasks.schema";
import type { toFeedItem } from "./feed-item";
import { notifications } from "./schema";
import { sql } from "drizzle-orm";

type FeedItem = NonNullable<ReturnType<typeof toFeedItem>>;
type Page = { after?: string; limit: number };

// Keep this relation narrow: access and grouping need no names, bodies, or excerpts.
function eligible(db: DatabaseExecutor, ctx: RepositoryContext, scope: MessagingIdentity) {
  const project = sql`coalesce(${tasks.projectEntityId}, ${projects.entityId})`;
  return sql`
    SELECT ${notifications.id} AS id, ${notifications.createdAt} AS created_at,
      ${notifications.readAt} AS read_at, ${notifications.kind} AS kind,
      ${notifications.eventKey} AS event_key, ${notifications.entityId} AS entity_id,
      ${messagingMessages.authorActorEntityId} AS message_actor,
      CASE WHEN ${notifications.entityId} IS NOT NULL
        THEN 'entity:' || ${notifications.entityId}::text
        ELSE 'thread:' || coalesce(${messagingMessages.threadId}, ${messagingMessages.id})::text
      END AS group_key
    FROM ${notifications}
    LEFT JOIN ${tasks} ON ${tasks.organizationId} = ${notifications.organizationId}
      AND ${tasks.entityId} = ${notifications.entityId}
    LEFT JOIN ${projects} ON ${projects.organizationId} = ${notifications.organizationId}
      AND ${projects.entityId} = ${notifications.entityId}
    LEFT JOIN ${messagingMessages} ON ${messagingMessages.id} = ${notifications.messageId}
    LEFT JOIN ${messagingConversations} ON ${messagingConversations.id} = ${messagingMessages.conversationId}
    WHERE ${notifications.organizationId} = ${scope.organizationId}
      AND ${notifications.recipientActorEntityId} = ${ctx.scope.actorEntityId}
      AND (
        (${notifications.entityId} IS NOT NULL AND ${ctx.readable(project)}
          AND (${tasks.entityId} IS NULL OR ${liveTask()}))
        OR (${notifications.entityId} IS NULL AND ${messagingConversations.id} IS NOT NULL
          AND ${visibleConversations(db, scope)})
      )`;
}

// Preserve PostgreSQL microseconds, including when several events share a millisecond.
const positionText = sql`to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const encode = (row: { id: string; at: string }) => JSON.stringify({ at: row.at, id: row.id });
function boundary(after?: string) {
  if (!after) return sql`true`;
  const { at, id } = notificationPosition(after);
  return sql`(created_at, id) < (${at}::timestamptz, ${id}::uuid)`;
}

export function createNotificationGroups(
  db: DatabaseExecutor,
  scope: MessagingIdentity,
  load: (ids: string[], context: RepositoryContext) => Promise<FeedItem[]>,
) {
  return {
    async groups({ after, limit, filter }: Page & { filter: "all" | "unread" }) {
      const { context: ctx } = await workspaceContext(db, scope);
      const rows = await db.execute<{
        id: string;
        at: string;
        groupKey: string;
        count: number;
        unreadCount: number;
        otherActorCount: number;
        mixedKinds: boolean;
      }>(sql`
        WITH eligible AS (${eligible(db, ctx, scope)}),
        events AS (
          SELECT eligible.*, coalesce(
            message_actor, ${taskActivity.actorEntityId}, ${taskComments.authorActorEntityId}
          ) AS actor_id
          FROM eligible LEFT JOIN ${taskActivity}
            ON eligible.kind = 'assignment'
            AND ${taskActivity.organizationId} = ${scope.organizationId}
            AND ${taskActivity.taskEntityId} = eligible.entity_id
            AND ${taskActivity.id}::text = eligible.event_key
          LEFT JOIN ${taskComments}
            ON eligible.kind = 'mention'
            AND ${taskComments.organizationId} = ${scope.organizationId}
            AND ${taskComments.taskEntityId} = eligible.entity_id
            AND ${taskComments.id}::text = eligible.event_key
        ),
        totals AS (
          SELECT group_key, count(*)::int AS count,
            count(*) FILTER (WHERE read_at IS NULL)::int AS unread_count,
            count(DISTINCT actor_id)::int AS actor_count,
            count(DISTINCT kind) > 1 AS mixed_kinds
          FROM events GROUP BY group_key
        ),
        newest AS (
          SELECT DISTINCT ON (group_key) id, created_at, group_key, actor_id
          FROM events ORDER BY group_key, created_at DESC, id DESC
        )
        SELECT id, ${positionText} AS at, group_key AS "groupKey", count,
          unread_count AS "unreadCount",
          greatest(0, actor_count - CASE WHEN actor_id IS NULL THEN 0 ELSE 1 END)::int AS "otherActorCount",
          mixed_kinds AS "mixedKinds"
        FROM newest JOIN totals USING (group_key)
        WHERE ${boundary(after)} AND ${filter === "unread" ? sql`unread_count > 0` : sql`true`}
        ORDER BY created_at DESC, id DESC LIMIT ${limit + 1}
      `);
      const page = rows.slice(0, limit);
      const items = page.length
        ? await load(
            page.map((row) => row.id),
            ctx,
          )
        : [];
      const byId = new Map(items.map((item) => [item.id, item]));
      return {
        items: page.flatMap((row) => {
          const item = byId.get(row.id);
          return item
            ? [
                {
                  ...item,
                  groupKey: row.groupKey,
                  count: row.count,
                  unreadCount: row.unreadCount,
                  otherActorCount: row.otherActorCount,
                  mixedKinds: row.mixedKinds,
                  newestCursor: encode(row),
                },
              ]
            : [];
        }),
        nextCursor: rows.length > limit ? encode(page.at(-1)!) : null,
      };
    },
    async groupEvents({ groupKey, after, limit }: Page & { groupKey: string }) {
      const { context: ctx } = await workspaceContext(db, scope);
      const rows = await db.execute<{ id: string; at: string }>(sql`
        WITH eligible AS (${eligible(db, ctx, scope)})
        SELECT id, ${positionText} AS at FROM eligible
        WHERE group_key = ${groupKey} AND ${boundary(after)}
        ORDER BY created_at DESC, id DESC LIMIT ${limit + 1}
      `);
      const page = rows.slice(0, limit);
      const items = page.length
        ? await load(
            page.map((row) => row.id),
            ctx,
          )
        : [];
      const positions = new Map(page.map((row) => [row.id, encode(row)]));
      return {
        items: items.map((item) => ({ ...item, eventCursor: positions.get(item.id)! })),
        nextCursor: rows.length > limit ? encode(page.at(-1)!) : null,
      };
    },
    async hasUnread() {
      const { context: ctx } = await workspaceContext(db, scope);
      const [row] = await db.execute<{ unread: boolean }>(sql`
        SELECT EXISTS (SELECT 1 FROM (${eligible(db, ctx, scope)}) eligible
          WHERE read_at IS NULL) AS unread
      `);
      return row!.unread;
    },
    async markGroupRead({ groupKey, through }: { groupKey: string; through: string }) {
      const { context: ctx } = await workspaceContext(db, scope);
      const { at, id } = notificationPosition(through);
      const [result] = await db.execute<{ allowed: boolean }>(sql`
        WITH eligible AS (${eligible(db, ctx, scope)}), updated AS (
          UPDATE ${notifications} SET read_at = now()
          WHERE ${notifications.id} IN (
            SELECT id FROM eligible WHERE group_key = ${groupKey} AND read_at IS NULL
              AND (created_at, id) <= (${at}::timestamptz, ${id}::uuid)
          ) RETURNING ${notifications.id}
        )
        SELECT EXISTS (SELECT 1 FROM eligible WHERE group_key = ${groupKey}) AS allowed
      `);
      if (!result?.allowed) throw new AccessDeniedError();
    },
  };
}
