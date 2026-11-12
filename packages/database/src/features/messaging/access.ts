import type { DatabaseExecutor } from "../../client";
import { activeActorCondition } from "../../core/actors/access";
import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import { entities } from "../../core/entities/schema";
import { member } from "../../core/organizations/schema";
import type { SessionIdentity } from "../../core/session/identity";
import { AccessDeniedError, ValidationError } from "../../errors";
import { messagingConversations, messagingMessages, messagingParticipants } from "./schema";
import { messagingConnections } from "./sharing.schema";
import {
  and,
  eq,
  exists,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
  type SQLWrapper,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

// `conversation` is the participant's conversation row, or its alias.
export function approvedParticipant(
  db: DatabaseExecutor,
  conversation: typeof messagingConversations = messagingConversations,
) {
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
    eq(messagingParticipants.organizationId, conversation.organizationId),
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

/** The conversation is a public channel, which its own workspace sees. */
export function publicChannel(
  conversation: typeof messagingConversations = messagingConversations,
) {
  return sql<boolean>`(${eq(conversation.kind, "channel")} and ${eq(conversation.private, false)})`;
}

/**
 * The participant row is live and approved, so the conversation is visible in the participant's
 * workspace. `conversation` is the participant's conversation row, or its alias.
 */
export function liveApprovedParticipant(
  db: DatabaseExecutor,
  conversation: typeof messagingConversations = messagingConversations,
) {
  return and(isNull(messagingParticipants.leftAt), approvedParticipant(db, conversation));
}

// A person's membership is held by their human actor in their own organization. The alias keeps
// callers' correlated columns, such as an outer actors.user_id, bound to the outer row.
const participantActor = alias(actors, "participant_actor");

// A local agent's scope carries its owner's user ID, so the agent sees what the owner sees.
// Agent membership rows never grant access.
//
// The participant subquery joins its own conversation row, which approvedParticipant reads,
// instead of the outer one. It is uncorrelated for a fixed scope, so PostgreSQL computes the
// viewer's conversations once instead of once per conversation row.
export function visibleConversations(
  db: DatabaseExecutor,
  scope: { userId: string | SQLWrapper; organizationId: string | SQLWrapper },
) {
  return or(
    and(publicChannel(), eq(messagingConversations.organizationId, scope.organizationId)),
    inArray(
      messagingConversations.id,
      db
        .select({ id: messagingParticipants.conversationId })
        .from(messagingParticipants)
        .innerJoin(
          participantActor,
          and(
            eq(participantActor.entityId, messagingParticipants.actorEntityId),
            eq(participantActor.userId, scope.userId),
            eq(participantActor.organizationId, scope.organizationId),
            eq(participantActor.type, "human"),
          ),
        )
        .innerJoin(
          messagingConversations,
          eq(messagingConversations.id, messagingParticipants.conversationId),
        )
        .where(
          and(
            eq(messagingParticipants.organizationId, scope.organizationId),
            liveApprovedParticipant(db),
          ),
        ),
    ),
  );
}

/** A subquery of the IDs of the conversations the scope can see. */
export function visibleConversationIds(
  db: DatabaseExecutor,
  scope: { userId: string; organizationId: string },
) {
  return db
    .select({ id: messagingConversations.id })
    .from(messagingConversations)
    .where(visibleConversations(db, scope));
}

/**
 * An active person of the organization who can see the outer `messaging_conversations` row, as
 * mentions and the mention picker require. `entity` is the actor's entity row.
 */
export function mentionablePerson(
  db: DatabaseExecutor,
  organizationId: string,
  { actor = actors, entity = entities }: { actor?: typeof actors; entity?: typeof entities } = {},
) {
  return and(
    eq(actor.organizationId, organizationId),
    isNotNull(actor.userId),
    activeActorCondition(actor),
    isNull(entity.deletedAt),
    visibleConversations(db, { userId: actor.userId, organizationId }),
  );
}

/**
 * A live, active agent member of the conversation. Agent rows never grant access; callers add
 * the owner when only the owner may address the agent. `actor` is the participant's actor.
 */
export function liveAgentMember(
  conversationId: string,
  {
    participant = messagingParticipants,
    actor = actors,
  }: { participant?: typeof messagingParticipants; actor?: typeof actors } = {},
) {
  return and(
    eq(participant.conversationId, conversationId),
    eq(participant.actorType, "agent"),
    isNull(participant.leftAt),
    activeActorCondition(actor),
  );
}

/** Replies point to roots: a thread is a root message of this conversation. */
export const threadRoot = (conversationId: string, threadId: string) =>
  and(
    eq(messagingMessages.conversationId, conversationId),
    eq(messagingMessages.id, threadId),
    isNull(messagingMessages.threadId),
  );

export async function requireThreadRoot(
  db: DatabaseExecutor,
  conversationId: string,
  threadId: string,
) {
  const [root] = await db
    .select({ id: messagingMessages.id })
    .from(messagingMessages)
    .where(threadRoot(conversationId, threadId));
  if (!root) throw new ValidationError("Thread must be a root message in this conversation.");
}

export type Conversation = typeof messagingConversations.$inferSelect;
declare const conversationLock: unique symbol;
/** A conversation row locked in this transaction. */
export type LockedConversation = Conversation & {
  readonly [conversationLock]: "update" | "share";
};

/** The caller authorizes. "update" locks non-key changes but permits foreign-key inserts. */
export async function lockConversation(
  db: DatabaseExecutor,
  id: string,
  lock: "update" | "share",
): Promise<LockedConversation> {
  const [row] = await db
    .select()
    .from(messagingConversations)
    .where(eq(messagingConversations.id, id))
    .for(lock === "update" ? "no key update" : "share");
  if (!row) throw new AccessDeniedError();
  // SAFETY: the row was just selected with the lock, which holds until the transaction ends.
  return row as LockedConversation;
}

/**
 * Loads a conversation the scope can see. Membership, ownership, sharing and deletion take
 * "update" to serialize with each other. Posts, reactions and message mutations take "share":
 * they block those changes until commit but not each other at the conversation level. Reads lock
 * nothing.
 *
 * The lock comes first and visibility is read in a second statement. PostgreSQL rechecks a row
 * after a lock wait, but not the subqueries that grant visibility, so one statement would miss a
 * disconnect or removal that committed during the wait.
 */
export function loadConversation(
  db: DatabaseExecutor,
  scope: SessionIdentity,
  id: string,
  lock: "update" | "share",
): Promise<LockedConversation>;
export function loadConversation(
  db: DatabaseExecutor,
  scope: SessionIdentity,
  id: string,
  lock?: "update" | "share",
): Promise<Conversation>;
export async function loadConversation(
  db: DatabaseExecutor,
  scope: SessionIdentity,
  id: string,
  lock?: "update" | "share",
): Promise<Conversation> {
  if (lock) await lockConversation(db, id, lock);
  const [conversation] = await db
    .select()
    .from(messagingConversations)
    .where(and(eq(messagingConversations.id, id), visibleConversations(db, scope)));
  if (!conversation) throw new AccessDeniedError();
  return conversation;
}

export async function requireMessage(
  db: DatabaseExecutor,
  scope: SessionIdentity,
  messageId: string,
  lock?: "share",
) {
  if (lock) {
    const [target] = await db
      .select({ conversationId: messagingMessages.conversationId })
      .from(messagingMessages)
      .where(eq(messagingMessages.id, messageId));
    if (!target) throw new AccessDeniedError();
    await loadConversation(db, scope, target.conversationId, lock);
  }
  const query = db
    .select({ message: messagingMessages, conversation: messagingConversations })
    .from(messagingMessages)
    .innerJoin(
      messagingConversations,
      eq(messagingConversations.id, messagingMessages.conversationId),
    )
    .where(and(eq(messagingMessages.id, messageId), visibleConversations(db, scope)));
  // Source associations must not race message deletion or edits either. Keep read-only calls free
  // of locks, and lock only the message here: the conversation is already held above.
  const [row] = await (lock ? query.for("share", { of: messagingMessages }) : query);
  if (!row) throw new AccessDeniedError();
  return row;
}
