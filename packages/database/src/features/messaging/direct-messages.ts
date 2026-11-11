import type { DatabaseExecutor } from "../../client";
import { actors } from "../../core/actors/schema";
import { user } from "../../core/authentication/schema";
import type { SessionIdentity } from "../../core/session/identity";
import { approvedParticipant } from "./access";
import { messagingConversations, messagingParticipants } from "./schema";
import { messagingInvitations } from "./sharing.schema";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

// The lock serializes concurrent starts of the same DM, so the lookup and the insert that follows
// act as one step.
async function lockDirectMessage(db: DatabaseExecutor, key: string) {
  await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
}

/** A pair of actors has one DM per organization, started by either of them. */
export async function findDirectMessage(
  db: DatabaseExecutor,
  organizationId: string,
  actorIds: [string, string],
) {
  await lockDirectMessage(db, `messaging-dm:${organizationId}:${[...actorIds].sort().join(":")}`);
  const member = (actorEntityId: string) =>
    inArray(
      messagingConversations.id,
      db
        .select({ id: messagingParticipants.conversationId })
        .from(messagingParticipants)
        .where(eq(messagingParticipants.actorEntityId, actorEntityId)),
    );
  const [existing] = await db
    .select()
    .from(messagingConversations)
    .where(
      and(
        eq(messagingConversations.kind, "dm"),
        eq(messagingConversations.organizationId, organizationId),
        member(actorIds[0]),
        member(actorIds[1]),
      ),
    )
    .orderBy(desc(messagingConversations.createdAt))
    .limit(1);
  return existing;
}

/**
 * A creator has one DM per external email: with the approved person who accepted, or with a
 * pending invitation to that email.
 */
export async function findExternalDirectMessage(
  db: DatabaseExecutor,
  scope: SessionIdentity,
  email: string,
) {
  await lockDirectMessage(
    db,
    `messaging-dm-email:${scope.organizationId}:${scope.userId}:${email}`,
  );
  const [existing] = await db
    .select({ conversation: messagingConversations })
    .from(messagingConversations)
    .leftJoin(
      messagingParticipants,
      eq(messagingParticipants.conversationId, messagingConversations.id),
    )
    .leftJoin(actors, eq(actors.entityId, messagingParticipants.actorEntityId))
    .leftJoin(user, eq(user.id, actors.userId))
    .where(
      and(
        eq(messagingConversations.kind, "dm"),
        eq(messagingConversations.organizationId, scope.organizationId),
        eq(messagingConversations.createdBy, scope.userId),
        or(
          and(eq(user.email, email), isNull(messagingParticipants.leftAt), approvedParticipant(db)),
          inArray(
            messagingConversations.id,
            db
              .select({ id: messagingInvitations.conversationId })
              .from(messagingInvitations)
              .where(
                and(
                  eq(messagingInvitations.email, email),
                  eq(messagingInvitations.status, "pending"),
                  sql`${messagingInvitations.expiresAt} > now()`,
                ),
              ),
          ),
        ),
      ),
    )
    .limit(1);
  return existing?.conversation;
}

/** The viewer's DM with a person, for the profile shortcut. A read, so it takes no lock. */
export async function directConversationId(
  db: DatabaseExecutor,
  organizationId: string,
  viewerActorEntityId: string,
  userId: string,
) {
  const viewer = alias(messagingParticipants, "viewer");
  const target = alias(messagingParticipants, "target");
  const targetActor = alias(actors, "target_actor");
  const [row] = await db
    .select({ id: messagingConversations.id })
    .from(messagingConversations)
    .innerJoin(
      viewer,
      and(
        eq(viewer.conversationId, messagingConversations.id),
        eq(viewer.actorEntityId, viewerActorEntityId),
      ),
    )
    .innerJoin(target, eq(target.conversationId, messagingConversations.id))
    .innerJoin(
      targetActor,
      and(eq(targetActor.entityId, target.actorEntityId), eq(targetActor.userId, userId)),
    )
    .where(
      and(
        eq(messagingConversations.kind, "dm"),
        eq(messagingConversations.organizationId, organizationId),
      ),
    )
    .orderBy(desc(messagingConversations.createdAt))
    .limit(1);
  return row?.id ?? null;
}
