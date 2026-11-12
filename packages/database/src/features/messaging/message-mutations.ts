import { realtimeKeys } from "@substrate/contracts/realtime";

import type { DatabaseExecutor } from "../../client";
import type { SessionIdentity } from "../../core/session/identity";
import { messagingSession, type MessagingSessionResolver } from "../../core/session/messaging";
import { AccessDeniedError } from "../../errors";
import { applyMessageEffects } from "../context/message-effects";
import { messageEntityReferences, messageMessagingReferences } from "../context/schema";
import { messageAttachmentMetadata } from "../files/metadata";
import { messageAttachments } from "../files/schema";
import { notifications } from "../notifications/schema";
import { loadConversation } from "./access";
import { validateBody } from "./policy";
import { messagingMessages, messagingReactions } from "./schema";
import { and, eq } from "drizzle-orm";

export function messageMutationOperations(
  db: DatabaseExecutor,
  scope: Readonly<SessionIdentity>,
  authenticate: MessagingSessionResolver,
) {
  async function mutate(messageId: string, body?: string) {
    if (scope.actorEntityId) throw new AccessDeniedError();
    return db.transaction(async (tx) => {
      await authenticate(tx);
      const [target] = await tx
        .select({ conversationId: messagingMessages.conversationId })
        .from(messagingMessages)
        .where(eq(messagingMessages.id, messageId));
      if (!target) throw new AccessDeniedError();
      // Serialize with membership changes and mutations of this message, not other sends. Read
      // author and lifecycle state after the lock wait, never from a stale pre-lock message.
      const conversation = await loadConversation(tx, scope, target.conversationId, "share");
      const { actor, context } = await messagingSession(tx, scope);
      const [message] = await tx
        .select()
        .from(messagingMessages)
        .where(eq(messagingMessages.id, messageId))
        .for("no key update");
      if (!message || message.authorActorEntityId !== actor.entityId || message.deletedAt)
        throw new AccessDeniedError();
      const deleting = body === undefined;
      if (!deleting) {
        const attachments = await messageAttachmentMetadata(tx, [messageId]);
        validateBody(body, attachments.length);
        if (body === message.body) return { id: messageId };
      }
      // Explicit associations and source relationships are provenance, not parsed body content.
      await tx
        .delete(messageEntityReferences)
        .where(
          and(
            eq(messageEntityReferences.messageId, messageId),
            eq(messageEntityReferences.purpose, "mention"),
          ),
        );
      await tx
        .delete(messageMessagingReferences)
        .where(eq(messageMessagingReferences.messageId, messageId));
      const [updated] = await tx
        .update(messagingMessages)
        .set(deleting ? { body: "", deletedAt: new Date() } : { body, editedAt: new Date() })
        .where(eq(messagingMessages.id, messageId))
        .returning();
      if (deleting) {
        // Detaching blocks both metadata and content reads. Existing orphan-file retention
        // handles storage cleanup; do not remove files that another record still references.
        await tx.delete(messageAttachments).where(eq(messageAttachments.messageId, messageId));
        await tx.delete(messagingReactions).where(eq(messagingReactions.messageId, messageId));
        const removed = await tx
          .delete(notifications)
          .where(eq(notifications.messageId, messageId))
          .returning();
        for (const notification of removed)
          context.effects.hint({
            audience: realtimeKeys.actor(
              notification.organizationId,
              notification.recipientActorEntityId,
            ),
            domain: "notifications",
          });
      } else {
        await applyMessageEffects(context, scope, updated!, conversation, {
          delivery: false,
        });
      }
      // A full messaging hint refreshes previews and active search, not just timeline pages. The
      // identifiers keep the refresh to this message's thread and context pages.
      context.effects.hint({
        audience: realtimeKeys.conversation(conversation.id),
        domain: "messaging",
        messageId,
        threadId: message.threadId,
      });
      context.effects.hint({
        audience: realtimeKeys.organization(conversation.organizationId),
        domain: "context",
      });
      return { id: messageId };
    });
  }
  return {
    editMessage: (messageId: string, body: string) => mutate(messageId, body),
    deleteMessage: (messageId: string) => mutate(messageId),
  };
}
