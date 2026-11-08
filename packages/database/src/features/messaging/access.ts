import type { DatabaseExecutor } from "../../client";
import { AccessDeniedError } from "../../errors";
import {
  messagingConversations as conversations,
  messagingMessages as messages,
  messagingParticipants as participants,
  messagingAgentParticipants as agentParticipants,
} from "./schema";
import { and, eq, inArray, or, type SQLWrapper } from "drizzle-orm";

export interface MessagingIdentity {
  userId: string;
  organizationId: string;
  actorEntityId?: string;
}

export function visibleConversations(
  db: DatabaseExecutor,
  scope: {
    userId: string | SQLWrapper;
    organizationId: string | SQLWrapper;
    actorEntityId?: string;
  },
) {
  return or(
    and(
      eq(conversations.kind, "channel"),
      eq(conversations.private, false),
      eq(conversations.organizationId, scope.organizationId),
    ),
    inArray(
      conversations.id,
      scope.actorEntityId
        ? db
            .select({ id: agentParticipants.conversationId })
            .from(agentParticipants)
            .where(
              and(
                eq(agentParticipants.actorEntityId, scope.actorEntityId),
                eq(agentParticipants.organizationId, scope.organizationId),
              ),
            )
        : db
            .select({ id: participants.conversationId })
            .from(participants)
            .where(
              and(
                eq(participants.userId, scope.userId),
                eq(participants.organizationId, scope.organizationId),
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
    .select({ message: messages, conversation: conversations })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(and(eq(messages.id, messageId), visibleConversations(db, scope)));
  if (!row) throw new AccessDeniedError();
  return row;
}
