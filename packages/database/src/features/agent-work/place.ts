import type { DatabaseExecutor } from "../../core/executor";
import { AccessDeniedError, ValidationError } from "../../errors";
import { requireThreadRoot, visibleConversations } from "../messaging/access";
import { messagingConversations, messagingMessages } from "../messaging/schema";
import { and, eq } from "drizzle-orm";

export interface Place {
  conversationId: string | null;
  threadId: string | null;
  anchorMessageId: string | null;
}

/**
 * Checks that the owner can see the conversation, that the thread is a root message in it, and
 * that the anchor message is in it. A request or reply is placed only where its owner can look.
 */
export async function requirePlace(
  db: DatabaseExecutor,
  scope: SessionIdentity,
  input: {
    conversationId?: string | null;
    threadId?: string | null;
    anchorMessageId?: string | null;
  },
): Promise<Place> {
  const place = {
    conversationId: input.conversationId ?? null,
    threadId: input.threadId ?? null,
    anchorMessageId: input.anchorMessageId ?? null,
  };
  if (!place.conversationId) {
    if (place.threadId || place.anchorMessageId)
      throw new ValidationError("A thread or anchor needs its conversation.");
    return place;
  }
  const [conversation] = await db
    .select({ id: messagingConversations.id, kind: messagingConversations.kind })
    .from(messagingConversations)
    .where(
      and(eq(messagingConversations.id, place.conversationId), visibleConversations(db, scope)),
    );
  if (!conversation) throw new AccessDeniedError();
  if (place.threadId) await requireThreadRoot(db, place.conversationId, place.threadId);
  if (place.anchorMessageId) {
    const [anchor] = await db
      .select({ id: messagingMessages.id })
      .from(messagingMessages)
      .where(
        and(
          eq(messagingMessages.conversationId, place.conversationId),
          eq(messagingMessages.id, place.anchorMessageId),
        ),
      );
    if (!anchor) throw new ValidationError("The anchor message must be in this conversation.");
  }
  return place;
}
import type { SessionIdentity } from "../../core/session/identity";
