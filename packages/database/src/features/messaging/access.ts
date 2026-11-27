import { activeActorCondition } from "../../core/actors/access";
import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import { entities } from "../../core/entities/schema";
import type { DatabaseExecutor } from "../../core/executor";
import { member } from "../../core/organizations/schema";
import { entityReaders, readableCondition } from "../../core/permissions/visibility";
import type { SessionIdentity } from "../../core/session/identity";
import {
  AccessDeniedError,
  ConflictError,
  isForeignKeyViolation,
  ValidationError,
} from "../../errors";
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
  ne,
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
  return sql<boolean>`(${isNull(conversation.taskEntityId)} and ${eq(conversation.kind, "channel")} and ${eq(conversation.private, false)})`;
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

// A local agent reads with its owner's access. Agent DMs also require its own membership,
// so the owner's other agents cannot read them. Agent membership alone never grants access.
//
// The participant subquery joins its own conversation row, which approvedParticipant reads,
// instead of the outer one. It is uncorrelated for a fixed scope, so PostgreSQL computes the
// viewer's conversations once instead of once per conversation row.
export function visibleConversations(
  db: DatabaseExecutor,
  scope: {
    userId: string | SQLWrapper;
    organizationId: string | SQLWrapper;
    actorEntityId?: string;
  },
) {
  const directParticipant = alias(messagingParticipants, "agent_dm_viewer");
  return and(
    or(
      ne(messagingConversations.kind, "agent_dm"),
      and(
        eq(messagingConversations.organizationId, scope.organizationId),
        eq(messagingConversations.createdBy, scope.userId),
        scope.actorEntityId
          ? exists(
              db
                .select({ id: directParticipant.actorEntityId })
                .from(directParticipant)
                .where(
                  and(
                    eq(directParticipant.conversationId, messagingConversations.id),
                    eq(directParticipant.actorEntityId, scope.actorEntityId),
                    isNull(directParticipant.leftAt),
                  ),
                ),
            )
          : undefined,
      ),
    ),
    or(
      taskDiscussionAccess(db, scope),
      and(
        isNull(messagingConversations.taskEntityId),
        or(
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
        ),
      ),
    ),
  );
}

// Resolve the owner's human identity for both direct reads and correlated mention checks.
function taskDiscussionAccess(
  db: DatabaseExecutor,
  scope: { userId: string | SQLWrapper; organizationId: string | SQLWrapper },
  minimum: "view" | "comment" = "view",
) {
  const viewer = alias(actors, "discussion_viewer");
  const viewerEntity = alias(entities, "discussion_viewer_entity");
  return and(
    isNotNull(messagingConversations.taskEntityId),
    eq(messagingConversations.organizationId, scope.organizationId),
    exists(
      db
        .select({ id: viewer.entityId })
        .from(viewer)
        .innerJoin(
          viewerEntity,
          and(
            eq(viewerEntity.entityId, viewer.entityId),
            eq(viewerEntity.organizationId, viewer.organizationId),
          ),
        )
        .where(
          and(
            eq(viewer.organizationId, scope.organizationId),
            eq(viewer.userId, scope.userId),
            eq(viewer.type, "human"),
            activeActorCondition(viewer),
            isNull(viewerEntity.deletedAt),
            readableCondition(
              { organizationId: scope.organizationId, actorEntityId: viewer.entityId },
              messagingConversations.taskEntityId,
              minimum,
              "task",
            ),
          ),
        ),
    ),
  );
}

/**
 * The set form of visibleConversations for one conversation: the workspace that sees it as a
 * public channel, and the people who see it, as user and organization pairs. A task discussion's
 * readers are the people who can view the task, computed once with entityReaders, not once per
 * person. Agent rows never grant access. A missing conversation has no readers.
 */
export async function conversationReaders(
  db: DatabaseExecutor,
  conversationId: string,
): Promise<{ publicIn: string | null; readers: { userId: string; organizationId: string }[] }> {
  const rows = await db
    .select({
      organizationId: messagingConversations.organizationId,
      taskEntityId: messagingConversations.taskEntityId,
      publicChannel: publicChannel(),
      userId: actors.userId,
      participantOrganizationId: messagingParticipants.organizationId,
    })
    .from(messagingConversations)
    .leftJoin(
      messagingParticipants,
      and(
        eq(messagingParticipants.conversationId, messagingConversations.id),
        isNull(messagingConversations.taskEntityId),
        liveApprovedParticipant(db),
      ),
    )
    .leftJoin(
      actors,
      and(
        eq(actors.entityId, messagingParticipants.actorEntityId),
        eq(actors.organizationId, messagingParticipants.organizationId),
        eq(actors.type, "human"),
      ),
    )
    .where(eq(messagingConversations.id, conversationId));
  const [conversation] = rows;
  if (!conversation) return { publicIn: null, readers: [] };
  if (!conversation.taskEntityId)
    return {
      publicIn: conversation.publicChannel ? conversation.organizationId : null,
      readers: rows.flatMap(({ userId, participantOrganizationId: organizationId }) =>
        userId && organizationId ? [{ userId, organizationId }] : [],
      ),
    };
  // entityReaders holds the active-human, membership, task-access and apps terms of
  // taskDiscussionAccess; the reader's own actor entity must also be live.
  const readers = await db
    .select({ userId: actors.userId, organizationId: actors.organizationId })
    .from(actors)
    .innerJoin(
      entities,
      and(
        eq(entities.entityId, actors.entityId),
        eq(entities.organizationId, actors.organizationId),
      ),
    )
    .where(
      and(
        eq(actors.organizationId, conversation.organizationId),
        isNull(entities.deletedAt),
        sql`${actors.entityId} IN (${entityReaders(conversation.organizationId, conversation.taskEntityId)})`,
      ),
    );
  return {
    publicIn: null,
    readers: readers.flatMap(({ userId, organizationId }) =>
      userId ? [{ userId, organizationId }] : [],
    ),
  };
}

/** A subquery of the IDs of the conversations the scope can see. */
export function visibleConversationIds(
  db: DatabaseExecutor,
  scope: { userId: string; organizationId: string; actorEntityId?: string },
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
 * `conversationId` is an ID or an outer conversation column.
 */
export function liveAgentMember(
  conversationId: string | SQLWrapper,
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
/** Reads a conversation by ID. The caller authorizes. */
export async function conversationRow(db: DatabaseExecutor, id: string): Promise<Conversation> {
  const [row] = await db
    .select()
    .from(messagingConversations)
    .where(eq(messagingConversations.id, id));
  if (!row) throw new AccessDeniedError();
  return row;
}

/**
 * Claims the next version of a conversation for a membership, ownership, sharing or lifecycle
 * change. Such changes run one at a time: when another one committed since `conversation` was
 * read, this one fails with a conflict. Read the state the change depends on after the claim.
 * The caller authorizes.
 */
export async function claimConversationChange(
  db: DatabaseExecutor,
  conversation: Pick<Conversation, "id" | "version">,
): Promise<Conversation> {
  const [claimed] = await db
    .update(messagingConversations)
    .set({ version: sql`${messagingConversations.version} + 1` })
    .where(
      and(
        eq(messagingConversations.id, conversation.id),
        eq(messagingConversations.version, conversation.version),
      ),
    )
    .returning();
  if (claimed) return claimed;
  // A deleted conversation is denied, as for a read.
  await conversationRow(db, conversation.id);
  throw new ConflictError("This conversation changed. Try again.");
}

/** Reads a conversation by ID and claims its next version. The caller authorizes. */
export async function claimConversation(db: DatabaseExecutor, id: string) {
  return claimConversationChange(db, await conversationRow(db, id));
}

// These foreign keys fail when the conversation is deleted while a write to it is in progress.
// PostgreSQL keeps the first 63 bytes of a constraint name.
const conversationForeignKeys = [
  "messaging_participants_conversation_id_messaging_conversations_id_fk",
  "messaging_read_positions_conversation_id_messaging_conversations_id_fk",
].map((name) => name.slice(0, 63));

/** Denies a write whose conversation was deleted during the call, as a read would. */
export function denyDeletedConversation(error: Error): never {
  if (conversationForeignKeys.some((name) => isForeignKeyViolation(error, name)))
    throw new AccessDeniedError();
  throw error;
}

/**
 * Loads a conversation the scope can see. It takes no lock: a write that overlaps a removal or
 * a disconnect may commit. Foreign keys stop writes to a deleted conversation.
 */
export async function loadConversation(
  db: DatabaseExecutor,
  scope: SessionIdentity,
  id: string,
): Promise<Conversation> {
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
