import type { McpInput, McpOutput } from "@startup-os/contracts/harness/tools";

import { actors } from "../../core/actors/schema";
import type { RepositoryContext } from "../../core/repository-context";
import { AccessDeniedError, ValidationError } from "../../errors";
import { requireMessage, visibleConversations, type MessagingIdentity } from "../messaging/access";
import {
  messagingConversations as conversations,
  messagingMessages as messages,
} from "../messaging/schema";
import { pagination } from "./pagination";
import { actorSelection } from "./tasks";
import { and, desc, eq, gte, isNotNull, isNull, lt, sql } from "drizzle-orm";

export function mcpMessagingQueries(ctx: RepositoryContext, identity: MessagingIdentity) {
  const { db, scope } = ctx;
  return {
    async listConversations(input: McpInput<"list_conversations">) {
      const p = pagination(scope, "list_conversations", input);
      const lastActivity = sql<Date | null>`(select max(m.created_at) from ${messages} m where m.conversation_id = ${conversations.id})`;
      const rows = await db
        .select({
          id: conversations.id,
          kind: conversations.kind,
          name: sql<string>`coalesce(${conversations.name}, 'Conversation')`,
          lastActivityAt: lastActivity,
        })
        .from(conversations)
        .where(
          and(
            visibleConversations(db, identity),
            input.kind ? eq(conversations.kind, input.kind) : undefined,
            input.activeSince
              ? sql`${lastActivity} >= ${input.activeSince}::timestamptz`
              : undefined,
          ),
        )
        .orderBy(desc(conversations.createdAt), desc(conversations.id))
        .offset(p.offset)
        .limit(p.take);
      return p.page(rows);
    },
    async listMessages(input: McpInput<"list_messages">) {
      const [conversation] = await db
        .select({ id: conversations.id })
        .from(conversations)
        .where(and(eq(conversations.id, input.conversationId), visibleConversations(db, identity)));
      if (!conversation) throw new AccessDeniedError();
      if (input.threadId) {
        const { message } = await requireMessage(db, identity, input.threadId);
        if (message.conversationId !== input.conversationId || message.threadId)
          throw new ValidationError("Thread must be a root message in this conversation.");
      }
      const p = pagination(scope, "list_messages", input);
      const window = [
        input.since ? gte(messages.createdAt, new Date(input.since)) : undefined,
        input.until ? lt(messages.createdAt, new Date(input.until)) : undefined,
      ];
      const rows = await db
        .select({
          id: messages.id,
          author: actorSelection,
          body: messages.body,
          createdAt: messages.createdAt,
          replyCount: sql<number>`(select count(*)::int from ${messages} r where r.conversation_id = ${messages.conversationId} and r.thread_id = ${messages.id})`,
          lastReplyAt: sql<
            string | null
          >`(select max(r.created_at)::text from ${messages} r where r.conversation_id = ${messages.conversationId} and r.thread_id = ${messages.id})`,
        })
        .from(messages)
        .innerJoin(actors, eq(actors.entityId, messages.authorActorEntityId))
        .where(
          and(
            eq(messages.conversationId, input.conversationId),
            input.threadId ? eq(messages.threadId, input.threadId) : isNull(messages.threadId),
            ...window,
          ),
        )
        .orderBy(desc(messages.createdAt), desc(messages.id))
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
          threadId: sql<string>`${messages.threadId}`,
          rootMessageId: sql<string>`${messages.threadId}`,
          replyCountInWindow: sql<number>`count(*)::int`,
          lastReplyAt: sql<string>`max(${messages.createdAt})::text`,
        })
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, input.conversationId),
            isNotNull(messages.threadId),
            ...window,
          ),
        )
        .groupBy(messages.threadId)
        .orderBy(desc(sql`max(${messages.createdAt})`), desc(messages.threadId))
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
