import type { DatabaseExecutor } from "../../client";
import { AccessDeniedError } from "../../errors";
import { visibleConversations, type MessagingIdentity } from "../messaging/access";
import { messagingConversations, messagingMessages } from "../messaging/schema";
import type { Reference } from "./references";
import { messageMessagingReferences } from "./schema";
import { and, asc, eq, exists, inArray, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

// Messages reference channels and threads of their own organization that the author can see.
// A thread is a root message with at least one reply. Any other target rejects the message.
export async function saveMessagingReferences(
  db: DatabaseExecutor,
  scope: MessagingIdentity,
  message: typeof messagingMessages.$inferSelect,
  conversationOrganizationId: string,
  references: (Reference & { kind: "channel" | "thread" })[],
) {
  if (!references.length) return;
  if (conversationOrganizationId !== scope.organizationId) throw new AccessDeniedError();
  const ids = (kind: Reference["kind"]) =>
    references.flatMap((reference) => (reference.kind === kind ? [reference.id] : []));
  const channelIds = ids("channel");
  const threadIds = ids("thread");
  const visibleChannel = and(
    eq(messagingConversations.organizationId, scope.organizationId),
    eq(messagingConversations.kind, "channel"),
    visibleConversations(db, scope),
  );
  const channels = channelIds.length
    ? await db
        .select({ id: messagingConversations.id, conversationId: messagingConversations.id })
        .from(messagingConversations)
        .where(and(inArray(messagingConversations.id, channelIds), visibleChannel))
    : [];
  const replies = alias(messagingMessages, "replies");
  const threads = threadIds.length
    ? await db
        .select({ id: messagingMessages.id, conversationId: messagingMessages.conversationId })
        .from(messagingMessages)
        .innerJoin(
          messagingConversations,
          eq(messagingConversations.id, messagingMessages.conversationId),
        )
        .where(
          and(
            inArray(messagingMessages.id, threadIds),
            isNull(messagingMessages.threadId),
            visibleChannel,
            exists(
              db
                .select({ id: replies.id })
                .from(replies)
                .where(
                  and(
                    eq(replies.conversationId, messagingMessages.conversationId),
                    eq(replies.threadId, messagingMessages.id),
                  ),
                ),
            ),
          ),
        )
    : [];
  if (channels.length !== channelIds.length || threads.length !== threadIds.length)
    throw new AccessDeniedError();
  const targets = new Map([...channels, ...threads].map((row) => [row.id, row.conversationId]));
  await db
    .insert(messageMessagingReferences)
    .values(
      references.map((reference) => ({
        organizationId: scope.organizationId,
        conversationId: message.conversationId,
        messageId: message.id,
        kind: reference.kind,
        targetId: reference.id,
        targetConversationId: targets.get(reference.id)!,
        targetThreadId: reference.kind === "thread" ? reference.id : null,
      })),
    )
    .onConflictDoNothing();
}

// The caller has checked access to every source message. Resolve target metadata with live access.
export async function messagingReferencePage(
  db: DatabaseExecutor,
  scope: MessagingIdentity,
  messageIds: string[],
) {
  return db
    .select({
      messageId: messageMessagingReferences.messageId,
      id: messageMessagingReferences.targetId,
      kind: messageMessagingReferences.kind,
      conversationId: messageMessagingReferences.targetConversationId,
      threadId: messageMessagingReferences.targetThreadId,
      title: sql<string>`CASE WHEN ${messageMessagingReferences.kind} = 'channel' THEN ${messagingConversations.name} ELSE left(${messagingMessages.body}, 160) END`,
      conversationName: messagingConversations.name,
    })
    .from(messageMessagingReferences)
    .innerJoin(
      messagingConversations,
      eq(messagingConversations.id, messageMessagingReferences.targetConversationId),
    )
    .leftJoin(
      messagingMessages,
      and(
        eq(messagingMessages.id, messageMessagingReferences.targetThreadId),
        isNull(messagingMessages.threadId),
      ),
    )
    .where(
      and(
        inArray(messageMessagingReferences.messageId, messageIds),
        eq(messageMessagingReferences.organizationId, scope.organizationId),
        eq(messagingConversations.organizationId, scope.organizationId),
        eq(messagingConversations.kind, "channel"),
        visibleConversations(db, scope),
      ),
    )
    .orderBy(asc(messageMessagingReferences.kind), asc(messageMessagingReferences.targetId));
}
