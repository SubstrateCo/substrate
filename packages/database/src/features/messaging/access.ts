import type { DatabaseExecutor } from "../../client";
import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import { member } from "../../core/organizations/schema";
import { AccessDeniedError } from "../../errors";
import { messagingConversations, messagingMessages, messagingParticipants } from "./schema";
import { messagingConnections } from "./sharing.schema";
import { and, eq, exists, inArray, isNotNull, isNull, lte, or, type SQLWrapper } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

export interface MessagingIdentity {
  userId: string;
  organizationId: string;
  actorEntityId?: string;
}

export function approvedParticipant(db: DatabaseExecutor) {
  const ownerParticipant = alias(messagingParticipants, "sharing_owner_participant");
  const participantAgent = alias(actors, "sharing_participant_agent");
  const ownerActor = alias(actors, "sharing_owner_actor");
  const consentingHuman = exists(
    db
      .select({ id: actors.entityId })
      .from(actors)
      .innerJoin(
        member,
        and(eq(member.userId, actors.userId), eq(member.organizationId, actors.organizationId)),
      )
      .where(
        and(
          eq(actors.entityId, messagingParticipants.actorEntityId),
          lte(member.createdAt, messagingParticipants.consentedAt),
        ),
      ),
  );
  const consentingOwner = exists(
    db
      .select({ id: ownerParticipant.actorEntityId })
      .from(participantAgent)
      .innerJoin(userAgents, eq(userAgents.id, participantAgent.userAgentId))
      .innerJoin(
        ownerActor,
        and(
          eq(ownerActor.userId, userAgents.userId),
          eq(ownerActor.organizationId, messagingParticipants.organizationId),
          eq(ownerActor.type, "human"),
        ),
      )
      .innerJoin(
        ownerParticipant,
        and(
          eq(ownerParticipant.actorEntityId, ownerActor.entityId),
          eq(ownerParticipant.conversationId, messagingParticipants.conversationId),
        ),
      )
      .innerJoin(
        member,
        and(
          eq(member.userId, ownerActor.userId),
          eq(member.organizationId, ownerActor.organizationId),
        ),
      )
      .where(
        and(
          eq(participantAgent.entityId, messagingParticipants.actorEntityId),
          isNull(ownerParticipant.leftAt),
          isNotNull(ownerParticipant.consentedAt),
          lte(member.createdAt, ownerParticipant.consentedAt),
        ),
      ),
  );
  return or(
    eq(messagingParticipants.organizationId, messagingConversations.organizationId),
    and(
      or(
        and(isNotNull(messagingParticipants.consentedAt), consentingHuman),
        and(eq(messagingParticipants.actorType, "agent"), consentingOwner),
      ),
      exists(
        db
          .select({ id: messagingConnections.conversationId })
          .from(messagingConnections)
          .where(
            and(
              eq(messagingConnections.conversationId, messagingParticipants.conversationId),
              eq(messagingConnections.organizationId, messagingParticipants.organizationId),
              isNull(messagingConnections.disconnectedAt),
            ),
          ),
      ),
    ),
  );
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
            approvedParticipant(db),
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
