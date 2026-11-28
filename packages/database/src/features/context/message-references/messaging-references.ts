import type { DatabaseExecutor } from "../../../core/executor";
import type { SessionIdentity } from "../../../core/session/identity";
import { messageReferences, type Reference } from "../../../core/text/references";
import { AccessDeniedError } from "../../../errors";
import { visibleConversations } from "../../messaging/access";
import { messagingConversations, messagingMessages } from "../../messaging/schema";
import { and, eq, exists, inArray, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

type MessagingReference = Reference & { kind: "channel" | "thread" };

const visibleChannel = (db: DatabaseExecutor, scope: SessionIdentity) =>
  and(
    eq(messagingConversations.organizationId, scope.organizationId),
    eq(messagingConversations.kind, "channel"),
    visibleConversations(db, scope),
  );

export async function checkMessagingReferences(
  db: DatabaseExecutor,
  scope: SessionIdentity,
  conversationOrganizationId: string,
  references: MessagingReference[],
) {
  if (!references.length) return;
  if (conversationOrganizationId !== scope.organizationId) throw new AccessDeniedError();
  const channelIds = references.flatMap((item) => (item.kind === "channel" ? [item.id] : []));
  const threadIds = references.flatMap((item) => (item.kind === "thread" ? [item.id] : []));
  const channels = channelIds.length
    ? await db
        .select({ id: messagingConversations.id })
        .from(messagingConversations)
        .where(and(inArray(messagingConversations.id, channelIds), visibleChannel(db, scope)))
    : [];
  const replies = alias(messagingMessages, "replies");
  const threads = threadIds.length
    ? await db
        .select({ id: messagingMessages.id })
        .from(messagingMessages)
        .innerJoin(
          messagingConversations,
          eq(messagingConversations.id, messagingMessages.conversationId),
        )
        .where(
          and(
            inArray(messagingMessages.id, threadIds),
            isNull(messagingMessages.deletedAt),
            isNull(messagingMessages.threadId),
            visibleChannel(db, scope),
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
}

export function bodyMessagingReferences(body: string): MessagingReference[] {
  return messageReferences(body).filter(
    (reference): reference is MessagingReference =>
      reference.kind === "channel" || reference.kind === "thread",
  );
}

export async function messagingReferencePage(
  db: DatabaseExecutor,
  scope: SessionIdentity,
  messages: { id: string; body: string }[],
) {
  const references = messages.flatMap((message) =>
    bodyMessagingReferences(message.body).map((reference) => ({
      messageId: message.id,
      ...reference,
    })),
  );
  const ids = (kind: MessagingReference["kind"]) => [
    ...new Set(references.flatMap((item) => (item.kind === kind ? [item.id] : []))),
  ];
  const channelIds = ids("channel");
  const threadIds = ids("thread");
  const [channels, threads] = await Promise.all([
    channelIds.length
      ? db
          .select({
            id: messagingConversations.id,
            conversationId: messagingConversations.id,
            threadId: sql<string | null>`null::uuid`,
            title: sql<string>`${messagingConversations.name}`,
            conversationName: messagingConversations.name,
          })
          .from(messagingConversations)
          .where(and(inArray(messagingConversations.id, channelIds), visibleChannel(db, scope)))
      : [],
    threadIds.length
      ? db
          .select({
            id: messagingMessages.id,
            conversationId: messagingConversations.id,
            threadId: sql<string | null>`${messagingMessages.id}`,
            title: sql<string>`CASE WHEN ${messagingMessages.deletedAt} IS NOT NULL THEN 'Message deleted' ELSE left(${messagingMessages.body}, 160) END`,
            conversationName: messagingConversations.name,
          })
          .from(messagingMessages)
          .innerJoin(
            messagingConversations,
            eq(messagingConversations.id, messagingMessages.conversationId),
          )
          .where(
            and(
              inArray(messagingMessages.id, threadIds),
              isNull(messagingMessages.threadId),
              visibleChannel(db, scope),
            ),
          )
      : [],
  ]);
  const targets = new Map([
    ...channels.map((target) => [`channel:${target.id}`, target] as const),
    ...threads.map((target) => [`thread:${target.id}`, target] as const),
  ]);
  return references
    .sort((left, right) => left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id))
    .flatMap((reference) => {
      const target = targets.get(`${reference.kind}:${reference.id}`);
      return target ? [{ ...target, messageId: reference.messageId, kind: reference.kind }] : [];
    });
}
