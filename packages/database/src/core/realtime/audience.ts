import type { RealtimeAudience } from "@startup-os/contracts/realtime";

import type { DatabaseExecutor } from "../../client";
import { messagingConversations, messagingParticipants } from "../../features/messaging/schema";
import { messagingConnections } from "../../features/messaging/sharing.schema";
import { activeActorCondition } from "../actors/access";
import { actors } from "../actors/schema";
import { user } from "../authentication/schema";
import { entities } from "../entities/schema";
import { member } from "../organizations/schema";
import { and, eq, exists, isNotNull, isNull, lte, or } from "drizzle-orm";

export interface RealtimeReceiver {
  userId: string;
  organizationId: string | null;
  actorId: string | null;
}

// Resolves a verified user and, in a workspace, their active human actor in one statement.
export async function resolveReceiver(
  db: DatabaseExecutor,
  identity: { userId: string; organizationId: string | null },
): Promise<RealtimeReceiver | null> {
  const verified = and(eq(user.id, identity.userId), eq(user.emailVerified, true));
  if (!identity.organizationId) {
    const [viewer] = await db.select({ id: user.id }).from(user).where(verified).limit(1);
    return viewer ? { userId: identity.userId, organizationId: null, actorId: null } : null;
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
    ? { userId: identity.userId, organizationId: identity.organizationId, actorId: actor.id }
    : null;
}

export type AudienceFilter = (receiver: RealtimeReceiver) => boolean;

// Resolves who may receive an audience, once per change. Only conversation audiences read the
// database, in one statement. The filter applies the same rules as visibleConversations: a public
// channel reaches its own workspace, and a live human participant reaches the participant's
// workspace. Callers must pass receivers freshly returned by resolveReceiver.
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
          kind: messagingConversations.kind,
          private: messagingConversations.private,
          userId: actors.userId,
          participantOrganizationId: messagingParticipants.organizationId,
        })
        .from(messagingConversations)
        .leftJoin(
          messagingParticipants,
          and(
            eq(messagingParticipants.conversationId, messagingConversations.id),
            isNull(messagingParticipants.leftAt),
            or(
              eq(messagingParticipants.organizationId, messagingConversations.organizationId),
              and(
                isNotNull(messagingParticipants.consentedAt),
                exists(
                  db
                    .select({ id: actors.entityId })
                    .from(actors)
                    .innerJoin(
                      member,
                      and(
                        eq(member.userId, actors.userId),
                        eq(member.organizationId, actors.organizationId),
                      ),
                    )
                    .where(
                      and(
                        eq(actors.entityId, messagingParticipants.actorEntityId),
                        lte(member.createdAt, messagingParticipants.consentedAt),
                      ),
                    ),
                ),
                exists(
                  db
                    .select({ id: messagingConnections.conversationId })
                    .from(messagingConnections)
                    .where(
                      and(
                        eq(
                          messagingConnections.conversationId,
                          messagingParticipants.conversationId,
                        ),
                        eq(
                          messagingConnections.organizationId,
                          messagingParticipants.organizationId,
                        ),
                        isNull(messagingConnections.disconnectedAt),
                      ),
                    ),
                ),
              ),
            ),
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
      const publicIn =
        conversation.kind === "channel" && !conversation.private
          ? conversation.organizationId
          : null;
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

// Callers must pass a receiver freshly returned by resolveReceiver.
export async function canReceiveAudience(
  db: DatabaseExecutor,
  receiver: RealtimeReceiver,
  audience: Readonly<RealtimeAudience>,
): Promise<boolean> {
  return (await audienceRecipients(db, audience))(receiver);
}

export async function canReceiveChange(
  db: DatabaseExecutor,
  identity: { userId: string; organizationId: string | null },
  audience: Readonly<RealtimeAudience>,
): Promise<boolean> {
  const receiver = await resolveReceiver(db, identity);
  return !!receiver && canReceiveAudience(db, receiver, audience);
}
