import {
  notificationPosition,
  type NotificationFilter,
} from "@substrate/contracts/context/notification-groups";
import { realtimeKeys } from "@substrate/contracts/realtime";

import { effectsFor } from "../../core/effects";
import type { DatabaseExecutor } from "../../core/executor";
import type { RepositoryContext } from "../../core/repository-context";
import type { SessionIdentity } from "../../core/session/identity";
import { AccessDeniedError } from "../../errors";
import { taskActivity } from "../activity/schema";
import { visibleConversations } from "../messaging/access";
import { messagingConversations, messagingMessages } from "../messaging/schema";
import { projects } from "../projects/schema";
import { tasks } from "../tasks/tasks.schema";
import type { toFeedItem } from "./feed-item";
import { notifications } from "./schema";
import { sql } from "drizzle-orm";

type FeedItem = NonNullable<ReturnType<typeof toFeedItem>>;
type Page = { after?: string; limit: number };

// Keep this relation narrow: access and grouping need no names, bodies, or excerpts.
function eligible(db: DatabaseExecutor, ctx: RepositoryContext, scope: SessionIdentity) {
  return sql`
    SELECT ${notifications.id} AS id, ${notifications.createdAt} AS created_at,
      ${notifications.readAt} AS read_at, ${notifications.kind} AS kind,
      CASE WHEN ${notifications.entityId} IS NULL
        THEN 'message:' || ${notifications.messageId}::text
        ELSE 'notification:' || ${notifications.id}::text END AS attention_key,
      ${notifications.eventKey} AS event_key, ${notifications.entityId} AS entity_id,
      ${messagingMessages.authorActorEntityId} AS message_actor,
      CASE WHEN ${notifications.entityId} IS NOT NULL
        THEN 'entity:' || ${notifications.entityId}::text
        ELSE 'thread:' || coalesce(${messagingMessages.threadId}, ${messagingMessages.id})::text
      END AS group_key
    FROM ${notifications}
    LEFT JOIN ${messagingMessages} ON ${messagingMessages.id} = ${notifications.messageId}
    LEFT JOIN ${messagingConversations} ON ${messagingConversations.id} = ${messagingMessages.conversationId}
    WHERE ${notifications.organizationId} = ${scope.organizationId}
      AND ${notifications.recipientActorEntityId} = ${ctx.scope.actorEntityId}
      AND (
        (${notifications.entityId} IS NOT NULL AND ${ctx.readable(notifications.entityId)}
          -- The feed shows only work targets. Others would light the dot with nothing to clear.
          AND (EXISTS (SELECT 1 FROM ${tasks} WHERE ${tasks.organizationId} = ${notifications.organizationId}
              AND ${tasks.entityId} = ${notifications.entityId})
            OR EXISTS (SELECT 1 FROM ${projects} WHERE ${projects.organizationId} = ${notifications.organizationId}
              AND ${projects.entityId} = ${notifications.entityId})))
         OR (${notifications.entityId} IS NULL AND ${messagingConversations.id} IS NOT NULL
           AND ${messagingMessages.deletedAt} IS NULL
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
  ctx: RepositoryContext,
  scope: SessionIdentity,
  load: (ids: string[]) => Promise<FeedItem[]>,
) {
  const { db } = ctx;
  return {
    async attentionKeys() {
      const rows = await db.execute<{ key: string }>(sql`
        SELECT attention_key AS key FROM (${eligible(db, ctx, scope)}) eligible
        WHERE read_at IS NULL
      `);
      return rows.map((row) => row.key);
    },
    async groups({ after, limit, filter }: Page & { filter: NotificationFilter }) {
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
            message_actor, ${taskActivity.actorEntityId}
          ) AS actor_id
          FROM eligible LEFT JOIN ${taskActivity}
            ON eligible.kind = 'assignment'
            AND ${taskActivity.organizationId} = ${scope.organizationId}
            AND ${taskActivity.taskEntityId} = eligible.entity_id
            AND ${taskActivity.id}::text = eligible.event_key
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
      const items = page.length ? await load(page.map((row) => row.id)) : [];
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
      const rows = await db.execute<{ id: string; at: string }>(sql`
        WITH eligible AS (${eligible(db, ctx, scope)})
        SELECT id, ${positionText} AS at FROM eligible
        WHERE group_key = ${groupKey} AND ${boundary(after)}
        ORDER BY created_at DESC, id DESC LIMIT ${limit + 1}
      `);
      const page = rows.slice(0, limit);
      const items = page.length ? await load(page.map((row) => row.id)) : [];
      const positions = new Map(page.map((row) => [row.id, encode(row)]));
      return {
        items: items.map((item) => ({ ...item, eventCursor: positions.get(item.id)! })),
        nextCursor: rows.length > limit ? encode(page.at(-1)!) : null,
      };
    },
    async hasUnread() {
      const [row] = await db.execute<{ unread: boolean }>(sql`
        SELECT EXISTS (SELECT 1 FROM (${eligible(db, ctx, scope)}) eligible
          WHERE read_at IS NULL) AS unread
      `);
      return row!.unread;
    },
    async markGroupRead({ groupKey, through }: { groupKey: string; through: string }) {
      const { at, id } = notificationPosition(through);
      const [result] = await db.execute<{ allowed: boolean; changed: boolean }>(sql`
        WITH eligible AS (${eligible(db, ctx, scope)}), updated AS (
          UPDATE ${notifications} SET read_at = now()
          WHERE ${notifications.id} IN (
            SELECT id FROM eligible WHERE group_key = ${groupKey} AND read_at IS NULL
              AND (created_at, id) <= (${at}::timestamptz, ${id}::uuid)
          ) RETURNING ${notifications.id}
        )
        SELECT EXISTS (SELECT 1 FROM eligible WHERE group_key = ${groupKey}) AS allowed,
          EXISTS (SELECT 1 FROM updated) AS changed
      `);
      if (!result?.allowed) throw new AccessDeniedError();
      if (result.changed)
        effectsFor(db).hint({ audience: realtimeKeys.user(scope.userId), domain: "notifications" });
    },
  };
}
