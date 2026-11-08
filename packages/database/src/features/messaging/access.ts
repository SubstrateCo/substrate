import type { DatabaseExecutor } from "../../client";
import { AccessDeniedError } from "../../errors";
import { messagingConversations, messagingMessages, messagingParticipants } from "./schema";
import { and, eq, inArray, isNull, or, type SQLWrapper } from "drizzle-orm";

export interface MessagingIdentity {
  userId: string;
  organizationId: string;
  actorEntityId?: string;
}

// A local agent's scope carries its owner's user ID, so the agent sees what the owner sees.
export function visibleConversations(
  db: DatabaseExecutor,
  scope: { userId: string | SQLWrapper; organizationId: string | SQLWrapper },
) {
  return or(
    and(
      eq(messagingConversations.kind, "channel"),
      eq(messagingConversations.private, false),
      eq(messagingConversations.organizationId, scope.organizationId),
    ),
    inArray(
      messagingConversations.id,
      db
        .select({ id: messagingParticipants.conversationId })
        .from(messagingParticipants)
        .where(
          and(
            eq(messagingParticipants.userId, scope.userId),
            eq(messagingParticipants.organizationId, scope.organizationId),
            isNull(messagingParticipants.leftAt),
          ),
        ),
    ),
  );
}

export async function requireMessage(
  db: DatabaseExecutor,
  scope: MessagingIdentity,
  messageId: string,
) {
  const [row] = await db
    .select({ message: messagingMessages, conversation: messagingConversations })
    .from(messagingMessages)
    .innerJoin(
      messagingConversations,
      eq(messagingConversations.id, messagingMessages.conversationId),
    )
    .where(and(eq(messagingMessages.id, messageId), visibleConversations(db, scope)));
  if (!row) throw new AccessDeniedError();
  return row;
}
