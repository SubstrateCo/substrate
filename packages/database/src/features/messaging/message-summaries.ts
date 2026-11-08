import type { DatabaseExecutor } from "../../client";
import { messagingMessages, messagingReactions } from "./schema";
import { and, eq, inArray, sql } from "drizzle-orm";

export async function messageSummaries(
  db: DatabaseExecutor,
  viewerActorEntityId: string,
  conversationId: string,
  rows: { id: string; threadId: string | null }[],
) {
  const allReactions = rows.length
    ? await db
        .select({
          messageId: messagingReactions.messageId,
          emoji: messagingReactions.emoji,
          count: sql<number>`count(*)::int`,
          reacted: sql<boolean>`bool_or(${messagingReactions.actorEntityId} = ${viewerActorEntityId})`,
        })
        .from(messagingReactions)
        .where(
          inArray(
            messagingReactions.messageId,
            rows.map((row) => row.id),
          ),
        )
        .groupBy(messagingReactions.messageId, messagingReactions.emoji)
    : [];
  const roots = rows.flatMap((row) => (row.threadId ? [] : [row.id]));
  const replies = roots.length
    ? await db
        .select({ threadId: messagingMessages.threadId, count: sql<number>`count(*)::int` })
        .from(messagingMessages)
        .where(
          and(
            eq(messagingMessages.conversationId, conversationId),
            inArray(messagingMessages.threadId, roots),
          ),
        )
        .groupBy(messagingMessages.threadId)
    : [];
  const replyCounts = new Map(replies.map((reply) => [reply.threadId, reply.count]));
  const byMessage = new Map<string, { emoji: string; count: number; reacted: boolean }[]>();
  for (const { messageId, ...reaction } of allReactions) {
    const group = byMessage.get(messageId) ?? [];
    group.push(reaction);
    byMessage.set(messageId, group);
  }
  return new Map(
    rows.map((row) => [
      row.id,
      {
        replyCount: replyCounts.get(row.id) ?? 0,
        reactions: byMessage.get(row.id) ?? [],
      },
    ]),
  );
}
