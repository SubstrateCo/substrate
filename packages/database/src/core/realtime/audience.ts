import type { RealtimeAudience } from "@startup-os/contracts/realtime";

import type { DatabaseExecutor } from "../../client";
import { visibleConversations } from "../../features/messaging/access";
import { messagingConversations } from "../../features/messaging/schema";
import { activeActorCondition } from "../actors/access";
import { actors } from "../actors/schema";
import { user } from "../authentication/schema";
import { entities } from "../entities/schema";
import { and, eq, isNull } from "drizzle-orm";

export async function canReceiveChange(
  db: DatabaseExecutor,
  identity: { userId: string; organizationId: string | null },
  audience: Readonly<RealtimeAudience>,
): Promise<boolean> {
  const [viewer] = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.id, identity.userId), eq(user.emailVerified, true)))
    .limit(1);
  if (!viewer) return false;
  if (audience[0] === "user") return audience[1] === identity.userId;
  if (!identity.organizationId) return false;
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
  if (!actor) return false;
  switch (audience[0]) {
    case "organization":
      return audience[1] === identity.organizationId;
    case "actor":
      return audience[1] === identity.organizationId && audience[2] === actor.id;
    case "conversation": {
      const [conversation] = await db
        .select({ id: messagingConversations.id })
        .from(messagingConversations)
        .where(
          and(
            eq(messagingConversations.id, audience[1]),
            visibleConversations(db, {
              userId: identity.userId,
              organizationId: identity.organizationId,
            }),
          ),
        )
        .limit(1);
      return !!conversation;
    }
  }
}
