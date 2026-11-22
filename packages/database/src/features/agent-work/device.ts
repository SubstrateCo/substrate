import { activeActorCondition } from "../../core/actors/access";
import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import type { DatabaseExecutor } from "../../core/executor";
import type { DeviceIdentity } from "../../core/session/device";
import { AccessDeniedError } from "../../errors";
import { and, eq } from "drizzle-orm";

/** The owner's active agents whose home is this device, with their actor in the organization. */
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

/** A subquery of the IDs of the owner's agents that this device runs. */
export function homedAgentIds(db: DatabaseExecutor, identity: DeviceIdentity, deviceId: string) {
  const homed = homedAgents(db, identity, deviceId).as("homed_agents");
  return db.select({ id: homed.userAgentId }).from(homed);
}

/** One of the owner's agents that this device runs. */
export async function requireHomedAgent(
  db: DatabaseExecutor,
  identity: DeviceIdentity,
  deviceId: string,
  userAgentId: string,
) {
  const [agent] = await homedAgents(db, identity, deviceId, userAgentId);
  if (!agent) throw new AccessDeniedError();
  return agent;
}
