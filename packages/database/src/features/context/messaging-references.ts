import type { DatabaseExecutor } from "../../client";
import { AccessDeniedError } from "../../errors";
import { requireMessage, visibleConversations, type MessagingIdentity } from "../messaging/access";
import { messagingConversations, messagingMessages } from "../messaging/schema";
import type { Reference } from "./references";
import { messageMessagingReferences } from "./schema";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

export async function saveMessagingReference(
  db: DatabaseExecutor,
  scope: MessagingIdentity,
  message: typeof messagingMessages.$inferSelect,
  conversationOrganizationId: string,
  reference: Reference & { kind: "channel" | "thread" },
) {
  if (conversationOrganizationId !== scope.organizationId) throw new AccessDeniedError();
  let conversationId: string;
  if (reference.kind === "channel") {
    const [channel] = await db
      .select({ id: messagingConversations.id })
      .from(messagingConversations)
      .where(
        and(
          eq(messagingConversations.id, reference.id),
          eq(messagingConversations.organizationId, scope.organizationId),
          eq(messagingConversations.kind, "channel"),
          visibleConversations(db, scope),
        ),
      );
    if (!channel) throw new AccessDeniedError();
    conversationId = channel.id;
  } else {
    const { message: root, conversation } = await requireMessage(db, scope, reference.id);
    if (
      root.threadId ||
      conversation.kind !== "channel" ||
      conversation.organizationId !== scope.organizationId
    )
      throw new AccessDeniedError();
    const [reply] = await db
      .select({ id: messagingMessages.id })
      .from(messagingMessages)
      .where(
        and(
          eq(messagingMessages.conversationId, conversation.id),
          eq(messagingMessages.threadId, root.id),
        ),
      )
      .limit(1);
    if (!reply) throw new AccessDeniedError();
    conversationId = conversation.id;
  }
  await db
    .insert(messageMessagingReferences)
    .values({
      organizationId: scope.organizationId,
      conversationId: message.conversationId,
      messageId: message.id,
      kind: reference.kind,
      targetId: reference.id,
      targetConversationId: conversationId,
      targetThreadId: reference.kind === "thread" ? reference.id : null,
    })
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
