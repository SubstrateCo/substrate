import type { DatabaseExecutor } from "../../client";
import {
  joinActorProfile,
  joinedActorName,
  joinedActorPicture,
} from "../../core/actors/joined-profile";
import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import { user } from "../../core/authentication/schema";
import { member } from "../../core/organizations/schema";
import type { SessionIdentity } from "../../core/session/identity";
import { ValidationError } from "../../errors";
import { approvedParticipant, type Conversation } from "./access";
import { messagingConversations, messagingParticipants } from "./schema";
import { and, asc, eq, inArray, isNotNull, isNull, ne, sql, type SQL } from "drizzle-orm";

// Participant rows are never deleted: messages and reactions reference them for authorship.
// A departure sets left_at, and the same row comes back when the member returns.

export interface MemberActor {
  entityId: string;
  type: "human" | "agent";
  /** The member's own organization. */
  organizationId: string;
}

/**
 * - join: adds or restores members, and returns only the rows that changed.
 * - leave: records a departure. A public channel member may never have posted, so the row may
 *   not exist yet.
 * - author: an agent's post records authorship, which the message foreign key requires, but
 *   never changes membership. Only its owner adds or removes it.
 * - consent: a partner accepted an invitation and joins with fresh consent.
 */
export async function writeMembers(
  db: DatabaseExecutor,
  conversationId: string,
  members: MemberActor[],
  change: "join" | "leave" | "author" | "consent",
) {
  if (!members.length) return [];
  const now = new Date();
  const insert = db.insert(messagingParticipants).values(
    members.map((actor) => ({
      conversationId,
      organizationId: actor.organizationId,
      actorEntityId: actor.entityId,
      actorType: actor.type,
      leftAt: change === "leave" || change === "author" ? now : null,
      consentedAt: change === "consent" ? now : null,
    })),
  );
  const target = [messagingParticipants.conversationId, messagingParticipants.actorEntityId];
  switch (change) {
    case "join":
      return insert
        .onConflictDoUpdate({
          target,
          set: { leftAt: null },
          setWhere: isNotNull(messagingParticipants.leftAt),
        })
        .returning();
    case "leave":
      return insert.onConflictDoUpdate({ target, set: { leftAt: now } }).returning();
    case "consent":
      return insert
        .onConflictDoUpdate({ target, set: { leftAt: null, consentedAt: now } })
        .returning();
    case "author":
      return insert.onConflictDoNothing().returning();
  }
}

/** Ends the matching participations and clears their consent. Rejoining needs new consent. */
export function endParticipation(db: DatabaseExecutor, condition: SQL | undefined) {
  return db
    .update(messagingParticipants)
    .set({ leftAt: new Date(), consentedAt: null })
    .where(condition);
}

/** Live, approved members by conversation. `agentId` is set only for the viewer's own agents. */
export async function activeMembers(
  db: DatabaseExecutor,
  conversationIds: string[],
  scope: SessionIdentity,
) {
  const name = joinedActorName();
  const rows = conversationIds.length
    ? await joinActorProfile(
        db
          .select({
            conversationId: messagingParticipants.conversationId,
            actorId: actors.entityId,
            type: actors.type,
            userId: actors.userId,
            agentId: sql<
              string | null
            >`case when ${userAgents.userId} = ${scope.userId} then ${userAgents.id} end`,
            name,
            image: joinedActorPicture(scope.userId),
            organizationId: messagingParticipants.organizationId,
          })
          .from(messagingParticipants)
          .innerJoin(actors, eq(actors.entityId, messagingParticipants.actorEntityId))
          .$dynamic(),
        scope.organizationId,
      )
        .innerJoin(
          messagingConversations,
          eq(messagingConversations.id, messagingParticipants.conversationId),
        )
        .where(
          and(
            inArray(messagingParticipants.conversationId, conversationIds),
            isNull(messagingParticipants.leftAt),
            approvedParticipant(db),
          ),
        )
        .orderBy(asc(actors.type), name, asc(actors.entityId))
    : [];
  const byConversation = new Map<string, typeof rows>();
  for (const row of rows) {
    const group = byConversation.get(row.conversationId) ?? [];
    group.push(row);
    byConversation.set(row.conversationId, group);
  }
  return byConversation;
}

/** Whether another live, approved person is a member. Agents cannot own conversations. */
export async function hasOtherPerson(db: DatabaseExecutor, conversationId: string, userId: string) {
  const [other] = await db
    .select({ id: messagingParticipants.actorEntityId })
    .from(messagingParticipants)
    .innerJoin(actors, eq(actors.entityId, messagingParticipants.actorEntityId))
    .innerJoin(
      messagingConversations,
      eq(messagingConversations.id, messagingParticipants.conversationId),
    )
    .where(
      and(
        eq(messagingParticipants.conversationId, conversationId),
        isNull(messagingParticipants.leftAt),
        isNotNull(actors.userId),
        ne(actors.userId, userId),
        approvedParticipant(db),
      ),
    )
    .limit(1);
  return !!other;
}

/** The new owner must be a current member with a verified account and live host membership. */
export async function setOwner(db: DatabaseExecutor, conversation: Conversation, userId: string) {
  const [candidate] = await db
    .select({ userId: user.id })
    .from(messagingParticipants)
    .innerJoin(actors, eq(actors.entityId, messagingParticipants.actorEntityId))
    .innerJoin(user, and(eq(user.id, actors.userId), eq(user.emailVerified, true)))
    .innerJoin(
      member,
      and(
        eq(member.userId, user.id),
        eq(member.organizationId, messagingParticipants.organizationId),
      ),
    )
    .where(
      and(
        eq(messagingParticipants.conversationId, conversation.id),
        eq(actors.userId, userId),
        eq(messagingParticipants.organizationId, conversation.organizationId),
        isNull(messagingParticipants.leftAt),
      ),
    );
  if (!candidate) throw new ValidationError("The new owner must be a current member.");
  await db
    .update(messagingConversations)
    .set({ createdBy: userId })
    .where(eq(messagingConversations.id, conversation.id));
}
