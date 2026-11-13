import type { RepositoryContext } from "../../core/repository-context";
import type { SessionIdentity } from "../../core/session/identity";
import { AccessDeniedError, ValidationError } from "../../errors";
import { visibleConversations } from "../messaging/access";
import { messagingConversations, messagingMessages } from "../messaging/schema";
import { messageAgents, messagePeople, messageWorkLinks } from "./message-metadata";
import { messagingReferencePage } from "./messaging-references";
import { and, eq, inArray, sql } from "drizzle-orm";

export async function messagePage(
  ctx: RepositoryContext,
  scope: SessionIdentity,
  messageIds: string[],
) {
  if (messageIds.length > 50) throw new ValidationError("At most 50 messages are allowed.");
  const { db } = ctx;
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
  const [messaging, work, people, agents] = await Promise.all([
    messagingReferencePage(db, scope, messages),
    messageWorkLinks(ctx, ids),
    messagePeople(db, scope, messages),
    messageAgents(db, scope, messages),
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
    agents: agents.get(id)!,
  }));
}
