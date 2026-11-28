import { realtimeKeys } from "@substrate/contracts/realtime";

import { entities } from "../../../core/entities/schema";
import type { DatabaseExecutor } from "../../../core/executor";
import type { SessionIdentity } from "../../../core/session/identity";
import type { MessagingSessionResolver } from "../../../core/session/messaging";
import { AccessDeniedError } from "../../../errors";
import { applyMessageEffects } from "../../context/message-references/message-effects";
import { messageEntityReferences } from "../../context/schema";
import { messageAttachmentMetadata } from "../../files/metadata";
import { messageAttachments } from "../../files/schema";
import { notifications } from "../../notifications/schema";
import { requireUnarchived } from "../../projects/archive";
import { referenceChangeHints } from "../../realtime/routing";
import { loadConversation } from "../access";
import { validateBody } from "../policy";
import { messagingMessages, messagingReactions } from "../schema";
import { and, eq, isNull } from "drizzle-orm";

export function messageMutationOperations(
  db: DatabaseExecutor,
  scope: Readonly<SessionIdentity>,
  authenticate: MessagingSessionResolver,
) {
  async function mutate(messageId: string, body?: string) {
    if (scope.actorEntityId) throw new AccessDeniedError();
    return db.transaction(async (tx) => {
      const { actor, context } = await authenticate(tx);
      const [message] = await tx
        .select()
        .from(messagingMessages)
        .where(eq(messagingMessages.id, messageId));
      if (!message) throw new AccessDeniedError();
      const conversation = await loadConversation(tx, scope, message.conversationId);
      if (conversation.taskEntityId) {
        await context.requireAccess(conversation.taskEntityId, "comment");
        await requireUnarchived(context, [conversation.taskEntityId]);
      }
      if (message.authorActorEntityId !== actor.entityId || message.deletedAt)
        throw new AccessDeniedError();
      const deleting = body === undefined;
      if (!deleting) {
        const attachments = await messageAttachmentMetadata(tx, [messageId]);
        validateBody(body, attachments.length);
        if (body === message.body) return { id: messageId };
      }
      const [updated] = await tx
        .update(messagingMessages)
        .set(deleting ? { body: "", deletedAt: new Date() } : { body, editedAt: new Date() })
        .where(
          and(
            eq(messagingMessages.id, messageId),
            eq(messagingMessages.authorActorEntityId, actor.entityId),
            isNull(messagingMessages.deletedAt),
          ),
        )
        .returning();
      if (!updated) throw new AccessDeniedError();
      const references = await tx
        .select({
          entityId: messageEntityReferences.entityId,
          containerId: entities.accessEntityId,
        })
        .from(messageEntityReferences)
        .innerJoin(
          entities,
          and(
            eq(entities.organizationId, messageEntityReferences.organizationId),
            eq(entities.entityId, messageEntityReferences.entityId),
          ),
        )
        .where(eq(messageEntityReferences.messageId, messageId));
      const referenced = references.map(({ entityId, containerId }) => ({
        entityId,
        projectEntityId: containerId,
      }));
      await tx
        .delete(messageEntityReferences)
        .where(
          and(
            eq(messageEntityReferences.messageId, messageId),
            eq(messageEntityReferences.purpose, "mention"),
          ),
        );
      if (deleting) {
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
        const { work } = await applyMessageEffects(context, scope, updated, conversation, {
          delivery: false,
        });
        referenced.push(...work);
      }
      context.effects.hint({
        audience: realtimeKeys.conversation(conversation.id),
        domain: "messaging",
        messageId,
        threadId: message.threadId,
      });
      for (const hint of referenceChangeHints(conversation.organizationId, referenced))
        context.effects.hint(hint);
      return { id: messageId };
    });
  }
  return {
    editMessage: (messageId: string, body: string) => mutate(messageId, body),
    deleteMessage: (messageId: string) => mutate(messageId),
  };
}
