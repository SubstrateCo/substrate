import { activeActorCondition } from "../../core/actors/access";
import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import type { DatabaseExecutor } from "../../core/executor";
import type { DeviceIdentity } from "../../core/session/device";
import { and, eq } from "drizzle-orm";

function homedAgents(
  db: DatabaseExecutor,
  identity: DeviceIdentity,
  deviceId: string,
  userAgentId?: string,
) {
  return db
    .select({ userAgentId: userAgents.id, actorId: actors.entityId })
    .from(userAgents)
    .innerJoin(actors, eq(actors.userAgentId, userAgents.id))
    .where(
      and(
        userAgentId ? eq(userAgents.id, userAgentId) : undefined,
        eq(userAgents.userId, identity.userId),
        eq(userAgents.homeDeviceId, deviceId),
        eq(actors.organizationId, identity.organizationId),
        activeActorCondition(),
      ),
    );
}

export function homedAgentIds(db: DatabaseExecutor, identity: DeviceIdentity, deviceId: string) {
  const homed = homedAgents(db, identity, deviceId).as("homed_agents");
  return db.select({ id: homed.userAgentId }).from(homed);
}
