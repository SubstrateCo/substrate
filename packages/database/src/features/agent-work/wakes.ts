import {
  wakeMachine,
  type AgentWakeInvocation,
  type AgentWakeRequestDetail,
  type AgentWakeState,
  type AgentWakeView,
  type DeviceCapability,
} from "@substrate/contracts/agent-work";
import { realtimeKeys } from "@substrate/contracts/realtime";

import type { DatabaseExecutor } from "../../client";
import { userAgents } from "../../core/actors/user-agents.schema";
import { effectsFor } from "../../core/effects";
import {
  requireDevice,
  type DeviceIdentity,
  type ResolvedDeviceIdentity,
} from "../../core/session/device";
import { admit } from "./admission";
import { homedAgentIds } from "./device";
import { dropWithheldCallerWakes } from "./invocations";
import { agentInvocations } from "./invocations.schema";
import { agentRequests } from "./requests.schema";
import { agentWakes } from "./wakes.schema";
import {
  and,
  asc,
  eq,
  exists,
  inArray,
  isNotNull,
  isNull,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

type RequestRow = typeof agentRequests.$inferSelect;
type InvocationRow = typeof agentInvocations.$inferSelect;

// A wake's state is stored as acked_at: null while the wake is pending.
const wakeIn = {
  pending: isNull(agentWakes.ackedAt),
  acked: isNotNull(agentWakes.ackedAt),
} satisfies Record<AgentWakeState, SQL>;

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

const invocationOf = (invocation: InvocationRow): AgentWakeInvocation => ({
  id: invocation.id,
  messageId: invocation.messageId,
  conversationId: invocation.conversationId,
  threadId: invocation.threadId,
  kind: invocation.kind,
  callerActorId: invocation.callerActorEntityId,
});

const toView = (
  wake: typeof agentWakes.$inferSelect,
  request: RequestRow | undefined,
  invocation: InvocationRow | undefined,
): AgentWakeView => {
  const view: AgentWakeView = {
    id: wake.id,
    userAgentId: wake.userAgentId,
    source: wake.source,
    sourceRef: wake.sourceRef,
    sessionKey: wake.sessionKey,
    dedupeKey: wake.dedupeKey,
    createdAt: wake.createdAt.toISOString(),
    // Only the decided request of this wake's own agent and owner.
    request: request && request.userAgentId === wake.userAgentId ? detailOf(request) : null,
  };
  // Older desktops never get caller wakes, so other wakes keep their exact earlier shape.
  if (wake.source === "caller_message")
    view.invocation =
      invocation && invocation.userAgentId === wake.userAgentId ? invocationOf(invocation) : null;
  return view;
};

function requestIdOf(wake: typeof agentWakes.$inferSelect) {
  return "requestId" in wake.sourceRef ? wake.sourceRef.requestId : null;
}

function invocationIdOf(wake: typeof agentWakes.$inferSelect) {
  return "invocationId" in wake.sourceRef ? wake.sourceRef.invocationId : null;
}

// Wakes of agents that this device runs, for this owner and organization.
function deviceWakes(db: DatabaseExecutor, identity: DeviceIdentity, deviceId: string) {
  return inArray(agentWakes.userAgentId, homedAgentIds(db, identity, deviceId));
}

/**
 * Unacknowledged wakes for agents whose home is this device, oldest first. An agent without a
 * home that has waiting wakes is adopted here. A desktop without the caller_wakes capability
 * gets no caller_message wakes: they stay pending for a desktop that can run them, for up to a
 * day. Its pull then drops the calls of older ones (see dropWithheldCallerWakes).
 */
export async function pullWakesForDevice(
  tx: DatabaseExecutor,
  identity: ResolvedDeviceIdentity,
  limit: number,
  capabilities: readonly DeviceCapability[] = [],
) {
  const device = { id: identity.deviceId };
  // Driven from the owner's homeless agents, so the wake check uses the per-agent pending index.
  const adopted = await tx
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
    )
    .returning({ id: userAgents.id });
  if (adopted.length)
    effectsFor(tx).hint({ audience: realtimeKeys.user(identity.userId), domain: "agents" });
  if (!capabilities.includes("caller_wakes"))
    await dropWithheldCallerWakes(
      tx,
      and(
        eq(agentWakes.ownerUserId, identity.userId),
        eq(agentWakes.organizationId, identity.organizationId),
        deviceWakes(tx, identity, device.id),
      )!,
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
        capabilities.includes("caller_wakes") ? undefined : ne(agentWakes.source, "caller_message"),
      ),
    )
    .orderBy(asc(agentWakes.createdAt), asc(agentWakes.id))
    .limit(limit);
  const invocationIds = rows.flatMap((wake) => invocationIdOf(wake) ?? []);
  const invocations = invocationIds.length
    ? await tx
        .select()
        .from(agentInvocations)
        .where(
          and(
            inArray(agentInvocations.id, invocationIds),
            eq(agentInvocations.ownerUserId, identity.userId),
            eq(agentInvocations.organizationId, identity.organizationId),
          ),
        )
    : [];
  const invocationById = new Map(invocations.map((row) => [row.id, row]));
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
    const invocationId = invocationIdOf(wake);
    return toView(
      wake,
      requestId ? byId.get(requestId) : undefined,
      invocationId ? invocationById.get(invocationId) : undefined,
    );
  });
}

/** Marks wakes as stored on this device. Repeating it, or naming other wakes, changes nothing. */
export async function ackWakesForDevice(
  tx: DatabaseExecutor,
  identity: ResolvedDeviceIdentity,
  ids: string[],
) {
  const device = { id: identity.deviceId };
  const acked = await tx
    .update(agentWakes)
    // The ack event moves the wake to acked: it records acked_at.
    .set({ ackedAt: sql`now()` })
    .where(
      and(
        inArray(agentWakes.id, ids),
        eq(agentWakes.ownerUserId, identity.userId),
        eq(agentWakes.organizationId, identity.organizationId),
        or(...wakeMachine.from("ack").map((state) => wakeIn[state])),
        deviceWakes(tx, identity, device.id),
      ),
    )
    .returning({ id: agentWakes.id });
  return { acked: acked.length };
}

export function pullWakes(
  db: DatabaseExecutor,
  identity: DeviceIdentity,
  limit: number,
  capabilities: readonly DeviceCapability[] = [],
) {
  return db.transaction(async (tx) => {
    const device = await requireDevice(tx, identity);
    return pullWakesForDevice(tx, { ...identity, deviceId: device.id }, limit, capabilities);
  });
}

export function ackWakes(db: DatabaseExecutor, identity: DeviceIdentity, ids: string[]) {
  return db.transaction(async (tx) => {
    const device = await requireDevice(tx, identity);
    return ackWakesForDevice(tx, { ...identity, deviceId: device.id }, ids);
  });
}

/** Wakes the agent with the owner's decision on a request. One wake per request and kind. */
export async function wakeForRequest(
  db: DatabaseExecutor,
  request: typeof agentRequests.$inferSelect,
  source: "answer" | "approval_result",
) {
  // Callers publish their own agent-work hint, so admit's hints are not needed here.
  await admit(db, [{ type: "request", source, request }]);
}
