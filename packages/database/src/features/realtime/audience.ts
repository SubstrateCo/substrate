import type { RealtimeAudience } from "@substrate/contracts/realtime";

import type { DatabaseExecutor } from "../../client";
import { activeActorCondition } from "../../core/actors/access";
import { actors } from "../../core/actors/schema";
import { user } from "../../core/authentication/schema";
import { entities } from "../../core/entities/schema";
import { adminRoleCondition } from "../../core/organizations/roles";
import { member } from "../../core/organizations/schema";
import { entityGrants } from "../../core/permissions/schema";
import { adminSharedType } from "../../core/permissions/visibility";
import { liveApprovedParticipant, publicChannel, visibleConversations } from "../messaging/access";
import { messagingConversations, messagingParticipants } from "../messaging/schema";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

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

// Resolves who may receive an audience, once per change. Only conversation and entity audiences
// read the database, each in one statement. Conversations use visibleConversations' predicates: a public channel reaches its
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
        .where(
          and(
            eq(messagingConversations.id, audience[1]),
            isNull(messagingConversations.taskEntityId),
          ),
        )
        .unionAll(
          db
            .select({
              organizationId: messagingConversations.organizationId,
              publicChannel: sql<boolean>`false`,
              userId: actors.userId,
              participantOrganizationId: actors.organizationId,
            })
            .from(messagingConversations)
            .innerJoin(
              actors,
              and(
                eq(actors.organizationId, messagingConversations.organizationId),
                eq(actors.type, "human"),
              ),
            )
            .where(
              and(
                eq(messagingConversations.id, audience[1]),
                isNotNull(messagingConversations.taskEntityId),
                visibleConversations(db, {
                  userId: actors.userId,
                  organizationId: actors.organizationId,
                }),
              ),
            ),
        );
      const publicIn = rows.find((row) => row.publicChannel)?.organizationId;
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
    case "entity": {
      // Readers of the entity's container: actors with a grant on it, and the organization's
      // admins when its type is shared. One statement, like entityAccessLevel's rules.
      const [, organizationId, entityId] = audience;
      const container = alias(entities, "audience_container");
      const target = and(
        eq(entities.organizationId, organizationId),
        eq(entities.entityId, entityId),
      );
      const rows = await db
        .select({
          actorId: sql<string | null>`${entityGrants.actorEntityId}`,
          userId: sql<string | null>`null`,
        })
        .from(entities)
        .innerJoin(
          entityGrants,
          and(
            eq(entityGrants.organizationId, entities.organizationId),
            eq(entityGrants.entityId, entities.accessEntityId),
          ),
        )
        .where(target)
        .union(
          db
            .select({
              actorId: sql<string | null>`null`,
              userId: sql<string | null>`${member.userId}`,
            })
            .from(entities)
            .innerJoin(
              container,
              and(
                eq(container.organizationId, entities.organizationId),
                eq(container.entityId, entities.accessEntityId),
              ),
            )
            .innerJoin(
              member,
              and(
                eq(member.organizationId, entities.organizationId),
                adminRoleCondition(member.role),
              ),
            )
            .where(and(target, adminSharedType(container.entityType))),
        );
      const readers = new Set(rows.flatMap((row) => (row.actorId ? [row.actorId] : [])));
      const admins = new Set(rows.flatMap((row) => (row.userId ? [row.userId] : [])));
      return (receiver) =>
        workspace(receiver) &&
        receiver.organizationId === organizationId &&
        (readers.has(receiver.actorId!) || admins.has(receiver.userId));
    }
  }
}
