import type { DatabaseExecutor } from "../../client";
import { activeActorCondition } from "../../core/actors/access";
import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import { touchDevice } from "../../core/devices/repository";
import { AccessDeniedError } from "../../errors";
import { workspaceContext } from "../context/access";
import { and, eq } from "drizzle-orm";

/** From the authenticated session. The installation ID names a registered device of that user. */
export interface DeviceIdentity {
  userId: string;
  organizationId: string;
  installationId: string;
}

/** From the authenticated session, for owner views and actions on any device. */
export interface OwnerIdentity {
  userId: string;
  organizationId: string;
}

// Verifies membership and the registered device in the caller's transaction.
export async function requireDevice(db: DatabaseExecutor, identity: DeviceIdentity) {
  await workspaceContext(db, { userId: identity.userId, organizationId: identity.organizationId });
  return touchDevice(db, identity.userId, identity.installationId);
}

/**
 * The owner's active agents whose home is this device, with their actor in the organization.
 * Requires a join of actors on actors.user_agent_id = user_agents.id.
 */
function homedAgents(identity: DeviceIdentity, deviceId: string) {
  return and(
    eq(userAgents.userId, identity.userId),
    eq(userAgents.homeDeviceId, deviceId),
    eq(actors.organizationId, identity.organizationId),
    activeActorCondition(),
  );
}

/** A subquery of the IDs of the owner's agents that this device runs. */
export function homedAgentIds(db: DatabaseExecutor, identity: DeviceIdentity, deviceId: string) {
  return db
    .select({ id: userAgents.id })
    .from(userAgents)
    .innerJoin(actors, eq(actors.userAgentId, userAgents.id))
    .where(homedAgents(identity, deviceId));
}

/** One of the owner's agents that this device runs. */
export async function requireHomedAgent(
  db: DatabaseExecutor,
  identity: DeviceIdentity,
  deviceId: string,
  userAgentId: string,
) {
  const [agent] = await db
    .select({ userAgentId: userAgents.id, actorId: actors.entityId })
    .from(userAgents)
    .innerJoin(actors, eq(actors.userAgentId, userAgents.id))
    .where(and(eq(userAgents.id, userAgentId), homedAgents(identity, deviceId)));
  if (!agent) throw new AccessDeniedError();
  return agent;
}
