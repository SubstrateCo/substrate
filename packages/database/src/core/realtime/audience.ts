import type { RealtimeAudience } from "@startup-os/contracts/realtime";

import type { DatabaseExecutor } from "../../client";
import { visibleConversations } from "../../features/messaging/access";
import { messagingConversations } from "../../features/messaging/schema";
import { activeActorCondition } from "../actors/access";
import { actors } from "../actors/schema";
import { user } from "../authentication/schema";
import { entities } from "../entities/schema";
import { and, eq, isNull } from "drizzle-orm";

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

// Callers must pass a receiver freshly returned by resolveReceiver.
export async function canReceiveAudience(
  db: DatabaseExecutor,
  receiver: RealtimeReceiver,
  audience: Readonly<RealtimeAudience>,
): Promise<boolean> {
  if (audience[0] === "user") return audience[1] === receiver.userId;
  const { organizationId, actorId } = receiver;
  if (!organizationId || !actorId) return false;
  switch (audience[0]) {
    case "organization":
      return audience[1] === organizationId;
    case "actor":
      return audience[1] === organizationId && audience[2] === actorId;
    case "conversation": {
      const [conversation] = await db
        .select({ id: messagingConversations.id })
        .from(messagingConversations)
        .where(
          and(
            eq(messagingConversations.id, audience[1]),
            visibleConversations(db, { userId: receiver.userId, organizationId }),
          ),
        )
        .limit(1);
      return !!conversation;
    }
  }
}

export async function canReceiveChange(
  db: DatabaseExecutor,
  identity: { userId: string; organizationId: string | null },
  audience: Readonly<RealtimeAudience>,
): Promise<boolean> {
  const receiver = await resolveReceiver(db, identity);
  return !!receiver && canReceiveAudience(db, receiver, audience);
}
