import type { McpInput, McpOutput } from "@startup-os/contracts/harness/tools";

import { actors } from "../../core/actors/schema";
import type { RepositoryContext } from "../../core/repository-context";
import { AccessDeniedError, ValidationError } from "../../errors";
import { requireMessage, visibleConversations, type MessagingIdentity } from "../messaging/access";
import { messagingConversations, messagingMessages } from "../messaging/schema";
import { pagination } from "./pagination";
import { actorSelection } from "./tasks";
import { and, desc, eq, gte, isNotNull, isNull, lt, sql } from "drizzle-orm";

export function mcpMessagingQueries(ctx: RepositoryContext, identity: MessagingIdentity) {
  const { db, scope } = ctx;
  return {
    async listConversations(input: McpInput<"list_conversations">) {
      const p = pagination(scope, "list_conversations", input);
      const lastActivity = sql<Date | null>`(select max(m.created_at) from ${messagingMessages} m where m.conversation_id = ${messagingConversations.id})`;
      const rows = await db
        .select({
          id: messagingConversations.id,
          kind: messagingConversations.kind,
          name: sql<string>`coalesce(${messagingConversations.name}, 'Conversation')`,
          lastActivityAt: lastActivity,
        })
        .from(messagingConversations)
        .where(
          and(
            visibleConversations(db, identity),
            input.kind ? eq(messagingConversations.kind, input.kind) : undefined,
            input.activeSince
              ? sql`${lastActivity} >= ${input.activeSince}::timestamptz`
              : undefined,
          ),
        )
        .orderBy(desc(messagingConversations.createdAt), desc(messagingConversations.id))
        .offset(p.offset)
        .limit(p.take);
      return p.page(rows);
    },
    async listMessages(input: McpInput<"list_messages">) {
      const [conversation] = await db
        .select({ id: messagingConversations.id })
        .from(messagingConversations)
        .where(
          and(
            eq(messagingConversations.id, input.conversationId),
            visibleConversations(db, identity),
          ),
        );
      if (!conversation) throw new AccessDeniedError();
      if (input.threadId) {
        const { message } = await requireMessage(db, identity, input.threadId);
        if (message.conversationId !== input.conversationId || message.threadId)
          throw new ValidationError("Thread must be a root message in this conversation.");
      }
      const p = pagination(scope, "list_messages", input);
      const window = [
        input.since ? gte(messagingMessages.createdAt, new Date(input.since)) : undefined,
        input.until ? lt(messagingMessages.createdAt, new Date(input.until)) : undefined,
      ];
      const rows = await db
        .select({
          id: messagingMessages.id,
          author: actorSelection,
          body: messagingMessages.body,
          createdAt: messagingMessages.createdAt,
          replyCount: sql<number>`(select count(*)::int from ${messagingMessages} r where r.conversation_id = ${messagingMessages.conversationId} and r.thread_id = ${messagingMessages.id})`,
          lastReplyAt: sql<
            string | null
          >`(select max(r.created_at)::text from ${messagingMessages} r where r.conversation_id = ${messagingMessages.conversationId} and r.thread_id = ${messagingMessages.id})`,
        })
        .from(messagingMessages)
        .innerJoin(actors, eq(actors.entityId, messagingMessages.authorActorEntityId))
        .where(
          and(
            eq(messagingMessages.conversationId, input.conversationId),
            input.threadId
              ? eq(messagingMessages.threadId, input.threadId)
              : isNull(messagingMessages.threadId),
            ...window,
          ),
        )
        .orderBy(desc(messagingMessages.createdAt), desc(messagingMessages.id))
        .offset(p.offset)
        .limit(p.take);
      const items = rows.map(({ replyCount, lastReplyAt, ...message }) => {
        const item: McpOutput<"list_messages">["messages"]["items"][number] = {
          ...message,
          createdAt: message.createdAt.toISOString(),
        };
        if (!input.threadId && replyCount && lastReplyAt)
          item.thread = {
            id: message.id,
            replyCount,
            lastReplyAt: new Date(lastReplyAt).toISOString(),
          };
        return item;
      });
      if (input.threadId) return { messages: p.page(items) };
      const threads = await db
        .select({
          threadId: sql<string>`${messagingMessages.threadId}`,
          rootMessageId: sql<string>`${messagingMessages.threadId}`,
          replyCountInWindow: sql<number>`count(*)::int`,
          lastReplyAt: sql<string>`max(${messagingMessages.createdAt})::text`,
        })
        .from(messagingMessages)
        .where(
          and(
            eq(messagingMessages.conversationId, input.conversationId),
            isNotNull(messagingMessages.threadId),
            ...window,
          ),
        )
        .groupBy(messagingMessages.threadId)
        .orderBy(desc(sql`max(${messagingMessages.createdAt})`), desc(messagingMessages.threadId))
        .offset(p.offset)
        .limit(p.take);
      const more = rows.length > input.limit || threads.length > input.limit;
      return {
        messages: p.page(items, more),
        activeThreads: p.page(
          threads.map((thread) => ({
            ...thread,
            lastReplyAt: new Date(thread.lastReplyAt).toISOString(),
          })),
          more,
        ),
      };
    },
  };
}
