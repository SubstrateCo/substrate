import type { DatabaseExecutor } from "../../client";
import { actors } from "../../core/actors/schema";
import { AccessDeniedError } from "../../errors";
import { messagingConversations, messagingMessages, messagingParticipants } from "./schema";
import { and, eq, inArray, isNull, or, type SQLWrapper } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

export interface MessagingIdentity {
  userId: string;
  organizationId: string;
  actorEntityId?: string;
}

// A person's membership is held by their human actor in their own organization. The alias keeps
// callers' correlated columns, such as an outer actors.user_id, bound to the outer row.
const participantActor = alias(actors, "participant_actor");
export function humanParticipant(
  db: DatabaseExecutor,
  scope: { userId: string | SQLWrapper; organizationId: string | SQLWrapper },
) {
  return inArray(
    messagingParticipants.actorEntityId,
    db
      .select({ id: participantActor.entityId })
      .from(participantActor)
      .where(
        and(
          eq(participantActor.userId, scope.userId),
          eq(participantActor.organizationId, scope.organizationId),
          eq(participantActor.type, "human"),
        ),
      ),
  );
}

// A local agent's scope carries its owner's user ID, so the agent sees what the owner sees.
// Agent membership rows never grant access.
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
            humanParticipant(db, scope),
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
