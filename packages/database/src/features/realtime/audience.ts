import type { RealtimeAudience } from "@substrate/contracts/realtime";

import type { DatabaseExecutor } from "../../client";
import { activeActorCondition } from "../../core/actors/access";
import { actors } from "../../core/actors/schema";
import { user } from "../../core/authentication/schema";
import { entities } from "../../core/entities/schema";
import { liveApprovedParticipant, publicChannel } from "../messaging/access";
import { messagingConversations, messagingParticipants } from "../messaging/schema";
import { and, eq, isNull } from "drizzle-orm";

declare const resolved: unique symbol;

/** Only resolveReceiver creates one, so audience filters see a checked identity. */
export interface RealtimeReceiver {
  userId: string;
  organizationId: string | null;
  actorId: string | null;
  readonly [resolved]: true;
}

// SAFETY: the brand is type-only; resolveReceiver calls this after its checks pass.
const receiver = (value: Omit<RealtimeReceiver, typeof resolved>) => value as RealtimeReceiver;

// Resolves a verified user and, in a workspace, their active human actor in one statement.
export async function resolveReceiver(
  db: DatabaseExecutor,
  identity: { userId: string; organizationId: string | null },
): Promise<RealtimeReceiver | null> {
  const verified = and(eq(user.id, identity.userId), eq(user.emailVerified, true));
  if (!identity.organizationId) {
    const [viewer] = await db.select({ id: user.id }).from(user).where(verified).limit(1);
    return viewer
      ? receiver({ userId: identity.userId, organizationId: null, actorId: null })
      : null;
  }
  const [actor] = await db
    .select({ id: actors.entityId })
    .from(actors)
    .innerJoin(
      entities,
      and(
        eq(entities.entityId, actors.entityId),
        eq(entities.organizationId, actors.organizationId),
      ),
    )
    .innerJoin(user, and(eq(user.id, actors.userId), verified))
    .where(
      and(
        eq(actors.organizationId, identity.organizationId),
        eq(actors.userId, identity.userId),
        eq(actors.type, "human"),
        isNull(entities.deletedAt),
        activeActorCondition(),
      ),
    )
    .limit(1);
  return actor
    ? receiver({
        userId: identity.userId,
        organizationId: identity.organizationId,
        actorId: actor.id,
      })
    : null;
}

export type AudienceFilter = (receiver: RealtimeReceiver) => boolean;

// Resolves who may receive an audience, once per change. Only conversation audiences read the
// database, in one statement, with visibleConversations' predicates: a public channel reaches its
// own workspace, and a live, approved human participant reaches the participant's workspace. Callers pass receivers freshly returned by resolveReceiver.
export async function audienceRecipients(
  db: DatabaseExecutor,
  audience: Readonly<RealtimeAudience>,
): Promise<AudienceFilter> {
  const workspace = (receiver: RealtimeReceiver) =>
    receiver.organizationId !== null && receiver.actorId !== null;
  switch (audience[0]) {
    case "user":
      return (receiver) => receiver.userId === audience[1];
    case "organization":
      return (receiver) => workspace(receiver) && receiver.organizationId === audience[1];
    case "actor":
      return (receiver) =>
        workspace(receiver) &&
        receiver.organizationId === audience[1] &&
        receiver.actorId === audience[2];
    case "conversation": {
      const rows = await db
        .select({
          organizationId: messagingConversations.organizationId,
          publicChannel: publicChannel(),
          userId: actors.userId,
          participantOrganizationId: messagingParticipants.organizationId,
        })
        .from(messagingConversations)
        .leftJoin(
          messagingParticipants,
          and(
            eq(messagingParticipants.conversationId, messagingConversations.id),
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
        .where(eq(messagingConversations.id, audience[1]));
      const [conversation] = rows;
      if (!conversation) return () => false;
      const publicIn = conversation.publicChannel ? conversation.organizationId : null;
      const members = new Set(
        rows.flatMap((row) =>
          row.userId && row.participantOrganizationId
            ? [JSON.stringify([row.userId, row.participantOrganizationId])]
            : [],
        ),
      );
      return (receiver) =>
        workspace(receiver) &&
        (receiver.organizationId === publicIn ||
          members.has(JSON.stringify([receiver.userId, receiver.organizationId])));
    }
  }
}
