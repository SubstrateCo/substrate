import { ensureUserAgentActor } from "../core/actors/provisioning";
import { registerDevice } from "../core/devices/repository";
import { user, userAgents } from "../schema";
import type { setupDatabase } from "./database";

type Fixture = ReturnType<typeof setupDatabase>;

/** A verified owner, an enabled local agent with an actor in orgA, and the owner's desktop. */
export async function ownedAgent(f: Fixture, userId = "alice", name = "Research") {
  await f.db.update(user).set({ emailVerified: true });
  const installationId = crypto.randomUUID();
  const device = await registerDevice(f.db, userId, {
    installationId,
    name: `${userId}'s laptop`,
    platform: "win32",
  });
  const [agent] = await f.db
    .insert(userAgents)
    .values({ userId, name, instructions: "", harness: "claude", homeDeviceId: device.id })
    .returning();
  const actor = await ensureUserAgentActor(f.db, {
    organizationId: f.orgA,
    userId,
    userAgentId: agent!.id,
  });
  return {
    agentId: agent!.id,
    actorId: actor.entityId,
    device,
    identity: { userId, organizationId: f.orgA, installationId },
  };
}
