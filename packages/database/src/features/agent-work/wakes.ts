import {
  wakeDedupeKeys,
  type AgentWakeRequestDetail,
  type AgentWakeView,
} from "@substrate/contracts/agent-work";

import type { DatabaseExecutor } from "../../client";
import { userAgents } from "../../core/actors/user-agents.schema";
import { requireDevice, type DeviceIdentity } from "../../core/session/device";
import { homedAgentIds } from "./device";
import { agentRequests } from "./requests.schema";
import { agentWakes } from "./wakes.schema";
import { and, asc, eq, exists, inArray, isNull, sql } from "drizzle-orm";

type RequestRow = typeof agentRequests.$inferSelect;

const detailOf = (request: RequestRow): AgentWakeRequestDetail => ({
  id: request.id,
  kind: request.kind,
  status: request.status,
  payload: request.payload,
  response: request.response ?? null,
  outcome: request.outcome ?? null,
  anchorMessageId: request.anchorMessageId,
  conversationId: request.conversationId,
  threadId: request.threadId,
});

const toView = (
  wake: typeof agentWakes.$inferSelect,
  request: RequestRow | undefined,
): AgentWakeView => ({
  id: wake.id,
  userAgentId: wake.userAgentId,
  source: wake.source,
  sourceRef: wake.sourceRef,
  sessionKey: wake.sessionKey,
  dedupeKey: wake.dedupeKey,
  createdAt: wake.createdAt.toISOString(),
  // Only the decided request of this wake's own agent and owner.
  request: request && request.userAgentId === wake.userAgentId ? detailOf(request) : null,
});

function requestIdOf(wake: typeof agentWakes.$inferSelect) {
  return "requestId" in wake.sourceRef ? wake.sourceRef.requestId : null;
}

// Wakes of agents that this device runs, for this owner and organization.
function deviceWakes(db: DatabaseExecutor, identity: DeviceIdentity, deviceId: string) {
  return inArray(agentWakes.userAgentId, homedAgentIds(db, identity, deviceId));
}

/**
 * Unacknowledged wakes for agents whose home is this device, oldest first. An agent without a
 * home that has waiting wakes is adopted here.
 */
export function pullWakes(db: DatabaseExecutor, identity: DeviceIdentity, limit: number) {
  return db.transaction(async (tx) => {
    const device = await requireDevice(tx, identity);
    // Driven from the owner's homeless agents, so the wake check uses the per-agent pending index.
    await tx
      .update(userAgents)
      .set({ homeDeviceId: device.id })
      .where(
        and(
          eq(userAgents.userId, identity.userId),
          isNull(userAgents.homeDeviceId),
          exists(
            tx
              .select({ id: agentWakes.id })
              .from(agentWakes)
              .where(
                and(
                  eq(agentWakes.userAgentId, userAgents.id),
                  isNull(agentWakes.ackedAt),
                  eq(agentWakes.ownerUserId, identity.userId),
                  eq(agentWakes.organizationId, identity.organizationId),
                ),
              ),
          ),
        ),
      );
    const rows = await tx
      .select()
      .from(agentWakes)
      .where(
        and(
          eq(agentWakes.ownerUserId, identity.userId),
          eq(agentWakes.organizationId, identity.organizationId),
          isNull(agentWakes.ackedAt),
          deviceWakes(tx, identity, device.id),
        ),
      )
      .orderBy(asc(agentWakes.createdAt), asc(agentWakes.id))
      .limit(limit);
    const requestIds = rows.flatMap((wake) => requestIdOf(wake) ?? []);
    const requests = requestIds.length
      ? await tx
          .select()
          .from(agentRequests)
          .where(
            and(
              inArray(agentRequests.id, requestIds),
              eq(agentRequests.ownerUserId, identity.userId),
              eq(agentRequests.organizationId, identity.organizationId),
            ),
          )
      : [];
    const byId = new Map(requests.map((request) => [request.id, request]));
    return rows.map((wake) => {
      const requestId = requestIdOf(wake);
      return toView(wake, requestId ? byId.get(requestId) : undefined);
    });
  });
}

/** Marks wakes as stored on this device. Repeating it, or naming other wakes, changes nothing. */
export function ackWakes(db: DatabaseExecutor, identity: DeviceIdentity, ids: string[]) {
  return db.transaction(async (tx) => {
    const device = await requireDevice(tx, identity);
    const acked = await tx
      .update(agentWakes)
      .set({ ackedAt: sql`now()` })
      .where(
        and(
          inArray(agentWakes.id, ids),
          eq(agentWakes.ownerUserId, identity.userId),
          eq(agentWakes.organizationId, identity.organizationId),
          isNull(agentWakes.ackedAt),
          deviceWakes(tx, identity, device.id),
        ),
      )
      .returning({ id: agentWakes.id });
    return { acked: acked.length };
  });
}

/** Wakes the agent with the owner's decision on a request. One wake per request and kind. */
export async function wakeForRequest(
  db: DatabaseExecutor,
  request: typeof agentRequests.$inferSelect,
  source: "answer" | "approval_result",
) {
  await db
    .insert(agentWakes)
    .values({
      organizationId: request.organizationId,
      userAgentId: request.userAgentId,
      agentActorEntityId: request.agentActorEntityId,
      ownerUserId: request.ownerUserId,
      source,
      sourceRef: { requestId: request.id },
      sessionKey: request.sessionKey,
      dedupeKey:
        source === "answer"
          ? wakeDedupeKeys.answer(request.id)
          : wakeDedupeKeys.approval(request.id),
    })
    .onConflictDoNothing();
}
