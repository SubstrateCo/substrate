import type { DatabaseExecutor } from "../../client";
import type { SessionIdentity } from "../../core/session/identity";
import { workspaceContext } from "../../core/session/workspace";
import { AccessDeniedError, ValidationError } from "../../errors";
import { visibleConversations } from "../messaging/access";
import { messagingConversations, messagingMessages } from "../messaging/schema";
import { messagePeople, messageWorkLinks } from "./message-metadata";
import { messagingReferencePage } from "./messaging-references";
import { and, eq, inArray, sql } from "drizzle-orm";

export async function messagePage(
  db: DatabaseExecutor,
  scope: SessionIdentity,
  messageIds: string[],
) {
  if (messageIds.length > 50) throw new ValidationError("At most 50 messages are allowed.");
  const { context: ctx } = await workspaceContext(db, scope);
  const ids = [...new Set(messageIds)];
  if (!ids.length) return [];
  const messages = await db
    .select({
      id: messagingMessages.id,
      body: sql<string>`case when ${messagingMessages.deletedAt} is null then ${messagingMessages.body} else '' end`,
      conversationId: messagingMessages.conversationId,
    })
    .from(messagingMessages)
    .innerJoin(
      messagingConversations,
      eq(messagingConversations.id, messagingMessages.conversationId),
    )
    .where(and(inArray(messagingMessages.id, ids), visibleConversations(db, scope)));
  // Reject the whole page before resolving any metadata if even one message is unavailable.
  if (messages.length !== ids.length) throw new AccessDeniedError();
  const [messaging, work, people] = await Promise.all([
    messages.some((message) => /@\[(channel|thread):/i.test(message.body))
      ? messagingReferencePage(db, scope, ids)
      : [],
    messageWorkLinks(ctx, ids),
    messagePeople(db, scope, messages),
  ]);
  const messagingByMessage = new Map<string, typeof messaging>();
  for (const reference of messaging) {
    const items = messagingByMessage.get(reference.messageId) ?? [];
    items.push(reference);
    messagingByMessage.set(reference.messageId, items);
  }
  return ids.map((id) => ({
    messageId: id,
    messaging: (messagingByMessage.get(id) ?? []).map((reference) => ({
      id: reference.id,
      kind: reference.kind,
      conversationId: reference.conversationId,
      threadId: reference.threadId,
      title: reference.title,
      conversationName: reference.conversationName,
    })),
    links: work.get(id) ?? [],
    people: people.get(id)!,
  }));
}
