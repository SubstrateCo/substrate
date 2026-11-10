import {
  blockingRequestTimeoutMs,
  type AgentRequestDelivery,
  type AgentRequestOpened,
  type AgentRequestPayload,
} from "@startup-os/contracts/agent-work";

import type { DatabaseExecutor } from "../../client";
import { AccessDeniedError } from "../../errors";
import { homedAgentIds, requireDevice, requireHomedAgent, type DeviceIdentity } from "./device";
import { requirePlace } from "./place";
import { agentRequests } from "./requests.schema";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

export interface OpenRequestInput {
  userAgentId: string;
  sessionKey: string;
  turnId: string;
  epoch: number;
  kind: "permission" | "question";
  mode: "blocking";
  nativeRequestId: string;
  anchorMessageId?: string;
  conversationId?: string;
  threadId?: string;
  payload: AgentRequestPayload;
}

function deviceRequests(db: DatabaseExecutor, identity: DeviceIdentity, deviceId: string) {
  return and(
    eq(agentRequests.ownerUserId, identity.userId),
    eq(agentRequests.organizationId, identity.organizationId),
    inArray(agentRequests.userAgentId, homedAgentIds(db, identity, deviceId)),
  );
}

/** Opens a native blocking prompt. Opening the same prompt again returns the same request. */
export function openRequest(
  db: DatabaseExecutor,
  identity: DeviceIdentity,
  input: OpenRequestInput,
) {
  return db.transaction(async (tx): Promise<AgentRequestOpened> => {
    const device = await requireDevice(tx, identity);
    const agent = await requireHomedAgent(tx, identity, device.id, input.userAgentId);
    const place = await requirePlace(tx, identity, input);
    const [created] = await tx
      .insert(agentRequests)
      .values({
        organizationId: identity.organizationId,
        userAgentId: agent.userAgentId,
        ownerUserId: identity.userId,
        agentActorEntityId: agent.actorId,
        sessionKey: input.sessionKey,
        turnId: input.turnId,
        epoch: input.epoch,
        kind: input.kind,
        mode: input.mode,
        nativeRequestId: input.nativeRequestId,
        ...place,
        payload: input.payload,
        expiresAt: sql`now() + make_interval(secs => ${blockingRequestTimeoutMs / 1000})`,
      })
      .onConflictDoNothing()
      .returning({ id: agentRequests.id, status: agentRequests.status });
    if (created) return created;
    const [existing] = await tx
      .select({ id: agentRequests.id, status: agentRequests.status })
      .from(agentRequests)
      .where(
        and(
          eq(agentRequests.userAgentId, agent.userAgentId),
          eq(agentRequests.turnId, input.turnId),
          eq(agentRequests.nativeRequestId, input.nativeRequestId),
        ),
      );
    if (!existing) throw new AccessDeniedError();
    return existing;
  });
}

const closable = {
  delivered: ["resolved"],
  cancelled: ["pending"],
  expired: ["pending"],
  orphaned: ["pending", "resolved"],
} as const;

/**
 * The desktop reports what happened to a request after the owner answered it or its native
 * callback went away. A transition that already happened, or no longer applies, changes nothing.
 */
export function closeRequest(
  db: DatabaseExecutor,
  identity: DeviceIdentity,
  requestId: string,
  status: keyof typeof closable,
) {
  return db.transaction(async (tx) => {
    const device = await requireDevice(tx, identity);
    const [request] = await tx
      .select({ id: agentRequests.id, status: agentRequests.status })
      .from(agentRequests)
      .where(and(eq(agentRequests.id, requestId), deviceRequests(tx, identity, device.id)));
    if (!request) throw new AccessDeniedError();
    const changed = await tx
      .update(agentRequests)
      .set(
        status === "delivered"
          ? { status, deliveredAt: sql`now()` }
          : { status, resolvedAt: sql`coalesce(${agentRequests.resolvedAt}, now())` },
      )
      .where(
        and(
          eq(agentRequests.id, requestId),
          eq(agentRequests.mode, "blocking"),
          inArray(agentRequests.status, [...closable[status]]),
        ),
      )
      .returning({ id: agentRequests.id });
    return { changed: changed.length > 0 };
  });
}

/** Answers the owner gave to this device's blocking requests that it has not delivered yet. */
export function requestAnswers(db: DatabaseExecutor, identity: DeviceIdentity) {
  return db.transaction(async (tx): Promise<AgentRequestDelivery[]> => {
    const device = await requireDevice(tx, identity);
    const rows = await tx
      .select({
        requestId: agentRequests.id,
        userAgentId: agentRequests.userAgentId,
        turnId: agentRequests.turnId,
        nativeRequestId: agentRequests.nativeRequestId,
        response: agentRequests.response,
      })
      .from(agentRequests)
      .where(
        and(
          deviceRequests(tx, identity, device.id),
          eq(agentRequests.mode, "blocking"),
          eq(agentRequests.status, "resolved"),
          isNull(agentRequests.deliveredAt),
        ),
      )
      .orderBy(asc(agentRequests.resolvedAt), asc(agentRequests.id));
    return rows.flatMap(({ response, nativeRequestId, ...row }) =>
      response && nativeRequestId ? [{ ...row, nativeRequestId, response }] : [],
    );
  });
}
