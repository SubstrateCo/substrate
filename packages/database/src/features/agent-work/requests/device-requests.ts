import {
  blockingRequestTimeoutMs,
  liveTurnStatuses,
  requestMachine,
  type AgentRequestDelivery,
  type AgentRequestOpened,
  type AgentRequestPayload,
  type OpenRequestKind,
} from "@substrate/contracts/agent-work";
import { realtimeKeys } from "@substrate/contracts/realtime";

import { effectsFor } from "../../../core/effects";
import type { DatabaseExecutor } from "../../../core/executor";
import { type DeviceIdentity, type ResolvedDeviceIdentity } from "../../../core/session/device";
import { AccessDeniedError, ConflictError } from "../../../errors";
import { homedAgentIds } from "../device";
import { requireDeviceTurn } from "../host/held-turn";
import { inStates } from "../machine-sql";
import { requirePlace } from "../place";
import { agentSessions } from "../sessions.schema";
import { agentRequests } from "./requests.schema";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

export interface OpenRequestInput {
  turnId: string;
  epoch: number;
  kind: OpenRequestKind;
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

export async function openRequestForDevice(
  tx: DatabaseExecutor,
  identity: ResolvedDeviceIdentity,
  input: OpenRequestInput,
): Promise<AgentRequestOpened> {
  const turn = await requireDeviceTurn(tx, identity, input.turnId);
  if (!liveTurnStatuses.includes(turn.status) || turn.leaseDeviceId !== identity.deviceId)
    throw new ConflictError("This device no longer runs this turn.");
  const [session] = await tx
    .select({ key: agentSessions.key })
    .from(agentSessions)
    .where(eq(agentSessions.id, turn.sessionId));
  const place = await requirePlace(tx, identity, input);
  const [created] = await tx
    .insert(agentRequests)
    .values({
      organizationId: identity.organizationId,
      userAgentId: turn.userAgentId,
      ownerUserId: identity.userId,
      agentActorEntityId: turn.agentActorEntityId,
      sessionKey: session!.key,
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
  if (created) {
    effectsFor(tx).hint({ audience: realtimeKeys.user(identity.userId), domain: "agent-work" });
    return created;
  }
  const [existing] = await tx
    .select({ id: agentRequests.id, status: agentRequests.status })
    .from(agentRequests)
    .where(
      and(
        eq(agentRequests.userAgentId, turn.userAgentId),
        eq(agentRequests.turnId, input.turnId),
        eq(agentRequests.nativeRequestId, input.nativeRequestId),
      ),
    );
  if (!existing) throw new AccessDeniedError();
  return existing;
}

const closable = {
  delivered: ["deliver"],
  cancelled: ["cancel"],
  expired: ["expire"],
  orphaned: ["orphan", "undeliver"],
} as const satisfies Record<string, readonly (keyof typeof requestMachine.events)[]>;

export async function closeRequestForDevice(
  tx: DatabaseExecutor,
  identity: ResolvedDeviceIdentity,
  requestId: string,
  status: keyof typeof closable,
) {
  const device = { id: identity.deviceId };
  const [request] = await tx
    .select({ id: agentRequests.id })
    .from(agentRequests)
    .where(and(eq(agentRequests.id, requestId), deviceRequests(tx, identity, device.id)));
  if (!request) throw new AccessDeniedError();
  const events: readonly (keyof typeof requestMachine.events)[] = closable[status];
  for (const event of events) {
    const to = requestMachine.events[event].to;
    const changed = await tx
      .update(agentRequests)
      .set(
        to === "delivered"
          ? { status: to, deliveredAt: sql`now()` }
          : { status: to, resolvedAt: sql`coalesce(${agentRequests.resolvedAt}, now())` },
      )
      .where(
        and(
          eq(agentRequests.id, requestId),
          eq(agentRequests.mode, "blocking"),
          inStates(agentRequests.status, requestMachine.from(event)),
        ),
      )
      .returning({ id: agentRequests.id });
    if (changed.length) {
      effectsFor(tx).hint({ audience: realtimeKeys.user(identity.userId), domain: "agent-work" });
      return { changed: true };
    }
  }
  return { changed: false };
}

export async function requestAnswersForDevice(
  tx: DatabaseExecutor,
  identity: ResolvedDeviceIdentity,
): Promise<AgentRequestDelivery[]> {
  const device = { id: identity.deviceId };
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
}

export async function requestStatusForDevice(
  db: DatabaseExecutor,
  identity: ResolvedDeviceIdentity,
  requestId: string,
) {
  const [request] = await db
    .select({ status: agentRequests.status, outcome: agentRequests.outcome })
    .from(agentRequests)
    .where(and(eq(agentRequests.id, requestId), deviceRequests(db, identity, identity.deviceId)));
  if (!request) throw new AccessDeniedError();
  return { status: request.status, outcome: request.outcome ?? null };
}
