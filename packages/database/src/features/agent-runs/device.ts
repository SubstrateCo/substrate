import {
  agentTriggers,
  renderAgentPrompt,
  type AgentRunDelivery,
  type AgentRunRequestPayload,
  type ClaimedAgentRun,
} from "@startup-os/contracts/agent-runs";

import type { DatabaseExecutor } from "../../client";
import { activeActorCondition } from "../../core/actors/access";
import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import { user } from "../../core/authentication/schema";
import { touchDevice } from "../../core/devices/repository";
import { AccessDeniedError, ConflictError } from "../../errors";
import { userAgentTriggers } from "../agents/triggers.schema";
import { workspaceContext } from "../context/access";
import { messagingConversations, messagingMessages } from "../messaging/schema";
import { cancelOpenRequests, leaseSeconds, sweepRuns } from "./lifecycle";
import { agentRunEvents, agentRunRequests, agentRunTriggers, agentRuns } from "./schema";
import { and, asc, desc, eq, inArray, isNotNull, isNull, notExists, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

export interface DeviceIdentity {
  userId: string;
  organizationId: string;
  installationId: string;
}

const lease = sql`now() + make_interval(secs => ${leaseSeconds})`;

// Trusted session identity only. Verifies membership and the registered device in the caller's
// transaction, then returns the device row.
async function requireDevice(db: DatabaseExecutor, identity: DeviceIdentity) {
  await workspaceContext(db, { userId: identity.userId, organizationId: identity.organizationId });
  return touchDevice(db, identity.userId, identity.installationId);
}

// A run this device holds. Cancelled runs stay reachable so the device can report their end.
async function requireHeldRun(
  db: DatabaseExecutor,
  identity: DeviceIdentity,
  deviceId: string,
  runId: string,
) {
  const [run] = await db
    .select()
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.id, runId),
        eq(agentRuns.ownerUserId, identity.userId),
        eq(agentRuns.organizationId, identity.organizationId),
        eq(agentRuns.deviceId, deviceId),
        inArray(agentRuns.status, ["running", "cancelled"]),
      ),
    )
    .for("update");
  if (!run) throw new AccessDeniedError();
  return run;
}

async function renderPrompt(db: DatabaseExecutor, run: typeof agentRuns.$inferSelect) {
  const triggers = await db
    .select({
      messageId: messagingMessages.id,
      body: messagingMessages.body,
      authorName: sql<string>`coalesce(${user.name}, ${actors.name})`,
    })
    .from(agentRunTriggers)
    .innerJoin(messagingMessages, eq(messagingMessages.id, agentRunTriggers.messageId))
    .innerJoin(actors, eq(actors.entityId, messagingMessages.authorActorEntityId))
    .leftJoin(user, eq(user.id, messagingMessages.authorId))
    .where(eq(agentRunTriggers.runId, run.id))
    .orderBy(asc(messagingMessages.createdAt), asc(messagingMessages.id));
  const agentActor = alias(actors, "agent_actor");
  const [context] = await db
    .select({
      agentName: agentActor.name,
      conversationKind: messagingConversations.kind,
      conversationName: messagingConversations.name,
      prompt: userAgentTriggers.prompt,
    })
    .from(messagingConversations)
    .innerJoin(agentActor, eq(agentActor.entityId, run.agentActorEntityId))
    .leftJoin(
      userAgentTriggers,
      and(
        eq(userAgentTriggers.userAgentId, run.userAgentId),
        eq(userAgentTriggers.kind, run.triggerKind),
      ),
    )
    .where(eq(messagingConversations.id, run.conversationId));
  const kindLabel = { dm: "direct message", group: "group conversation", channel: "channel" };
  const last = triggers.at(-1);
  return renderAgentPrompt(context?.prompt ?? agentTriggers[run.triggerKind].defaultPrompt, {
    agentName: context?.agentName ?? "Agent",
    authorName: last?.authorName ?? "Your owner",
    conversationName: context?.conversationName
      ? `#${context.conversationName}`
      : `a ${kindLabel[context?.conversationKind ?? "dm"]}`,
    conversationKind: kindLabel[context?.conversationKind ?? "dm"],
    conversationId: run.conversationId,
    threadId: run.threadId,
    messageId: last?.messageId ?? run.threadId,
    messages: triggers
      .map((trigger) => `${trigger.authorName} (message ${trigger.messageId}):\n${trigger.body}`)
      .join("\n\n"),
  });
}

/**
 * Starts the queued runs of agents whose home is this device. One run per agent and thread runs
 * at a time, so a thread's turns stay in order. An agent without a home is adopted here.
 */
export function claimRuns(db: DatabaseExecutor, identity: DeviceIdentity) {
  return db.transaction(async (tx): Promise<ClaimedAgentRun[]> => {
    const device = await requireDevice(tx, identity);
    await sweepRuns(tx, identity.userId);
    await tx
      .update(userAgents)
      .set({ homeDeviceId: device.id })
      .where(
        and(
          eq(userAgents.userId, identity.userId),
          isNull(userAgents.homeDeviceId),
          inArray(
            userAgents.id,
            tx
              .select({ id: agentRuns.userAgentId })
              .from(agentRuns)
              .where(
                and(eq(agentRuns.ownerUserId, identity.userId), eq(agentRuns.status, "queued")),
              ),
          ),
        ),
      );
    const running = alias(agentRuns, "running");
    const candidates = await tx
      .select({ run: agentRuns })
      .from(agentRuns)
      .innerJoin(userAgents, eq(userAgents.id, agentRuns.userAgentId))
      .innerJoin(actors, eq(actors.entityId, agentRuns.agentActorEntityId))
      .where(
        and(
          eq(agentRuns.ownerUserId, identity.userId),
          eq(agentRuns.organizationId, identity.organizationId),
          eq(agentRuns.status, "queued"),
          eq(userAgents.homeDeviceId, device.id),
          activeActorCondition(),
          notExists(
            tx
              .select({ id: running.id })
              .from(running)
              .where(
                and(
                  eq(running.agentActorEntityId, agentRuns.agentActorEntityId),
                  eq(running.threadId, agentRuns.threadId),
                  eq(running.status, "running"),
                ),
              ),
          ),
        ),
      )
      .orderBy(asc(agentRuns.createdAt), asc(agentRuns.id))
      .limit(20)
      .for("update", { of: agentRuns, skipLocked: true });
    const claimed: ClaimedAgentRun[] = [];
    for (const { run } of candidates) {
      await tx
        .update(agentRuns)
        .set({
          status: "running",
          deviceId: device.id,
          leaseExpiresAt: lease,
          startedAt: sql`now()`,
          activity: "Starting",
        })
        .where(eq(agentRuns.id, run.id));
      const [previous] = await tx
        .select({ sessionId: agentRuns.harnessSessionId })
        .from(agentRuns)
        .where(
          and(
            eq(agentRuns.agentActorEntityId, run.agentActorEntityId),
            eq(agentRuns.threadId, run.threadId),
            eq(agentRuns.deviceId, device.id),
            isNotNull(agentRuns.harnessSessionId),
          ),
        )
        .orderBy(desc(agentRuns.createdAt))
        .limit(1);
      claimed.push({
        id: run.id,
        agentId: run.userAgentId,
        conversationId: run.conversationId,
        threadId: run.threadId,
        prompt: await renderPrompt(tx, run),
        resumeSessionId: previous?.sessionId ?? null,
      });
    }
    return claimed;
  });
}

/** Extends leases of runs this device still holds and reports runs the owner cancelled. */
export function heartbeat(db: DatabaseExecutor, identity: DeviceIdentity, runIds: string[]) {
  return db.transaction(async (tx) => {
    const device = await requireDevice(tx, identity);
    if (!runIds.length) return { running: [], cancelled: [] };
    const held = and(
      inArray(agentRuns.id, runIds),
      eq(agentRuns.ownerUserId, identity.userId),
      eq(agentRuns.deviceId, device.id),
    );
    const running = await tx
      .update(agentRuns)
      .set({ leaseExpiresAt: lease })
      .where(and(held, eq(agentRuns.status, "running")))
      .returning({ id: agentRuns.id });
    const stopped = await tx
      .select({ id: agentRuns.id })
      .from(agentRuns)
      .where(and(held, inArray(agentRuns.status, ["cancelled", "failed", "expired"])));
    return { running: running.map((row) => row.id), cancelled: stopped.map((row) => row.id) };
  });
}

export function recordSession(
  db: DatabaseExecutor,
  identity: DeviceIdentity,
  runId: string,
  harnessSessionId: string,
) {
  return db.transaction(async (tx) => {
    const device = await requireDevice(tx, identity);
    await requireHeldRun(tx, identity, device.id, runId);
    await tx.update(agentRuns).set({ harnessSessionId }).where(eq(agentRuns.id, runId));
  });
}

export function appendEvents(
  db: DatabaseExecutor,
  identity: DeviceIdentity,
  runId: string,
  events: { kind: "text" | "activity" | "error"; text: string }[],
) {
  return db.transaction(async (tx) => {
    const device = await requireDevice(tx, identity);
    await requireHeldRun(tx, identity, device.id, runId);
    const [last] = await tx
      .select({ sequence: sql<number>`coalesce(max(${agentRunEvents.sequence}), 0)::int` })
      .from(agentRunEvents)
      .where(eq(agentRunEvents.runId, runId));
    const start = last?.sequence ?? 0;
    await tx
      .insert(agentRunEvents)
      .values(events.map((event, index) => ({ runId, sequence: start + index + 1, ...event })));
    const activity = events.filter((event) => event.kind !== "text").at(-1);
    if (activity)
      await tx
        .update(agentRuns)
        .set({ activity: activity.text.slice(0, 300) })
        .where(eq(agentRuns.id, runId));
  });
}

export function openRequest(
  db: DatabaseExecutor,
  identity: DeviceIdentity,
  input: { runId: string; nativeRequestId: string; payload: AgentRunRequestPayload },
) {
  return db.transaction(async (tx) => {
    const device = await requireDevice(tx, identity);
    const run = await requireHeldRun(tx, identity, device.id, input.runId);
    if (run.status !== "running") throw new ConflictError("This run has stopped.");
    const [created] = await tx
      .insert(agentRunRequests)
      .values(input)
      .onConflictDoNothing()
      .returning({ id: agentRunRequests.id });
    if (created) return { id: created.id };
    const [existing] = await tx
      .select({ id: agentRunRequests.id })
      .from(agentRunRequests)
      .where(
        and(
          eq(agentRunRequests.runId, input.runId),
          eq(agentRunRequests.nativeRequestId, input.nativeRequestId),
        ),
      );
    return { id: existing!.id };
  });
}

/**
 * The device reports what happened to a request after the server stopped tracking it:
 * an answer was delivered or could not be, or the harness withdrew a pending request.
 */
export function closeRequest(
  db: DatabaseExecutor,
  identity: DeviceIdentity,
  requestId: string,
  status: "delivered" | "failed" | "cancelled",
) {
  return db.transaction(async (tx) => {
    const device = await requireDevice(tx, identity);
    const [request] = await tx
      .select({ request: agentRunRequests })
      .from(agentRunRequests)
      .innerJoin(agentRuns, eq(agentRuns.id, agentRunRequests.runId))
      .where(
        and(
          eq(agentRunRequests.id, requestId),
          eq(agentRuns.ownerUserId, identity.userId),
          eq(agentRuns.deviceId, device.id),
        ),
      )
      .for("update", { of: agentRunRequests });
    if (!request) throw new AccessDeniedError();
    const { status: current } = request.request;
    if (status === "delivered" && current === "resolved")
      await tx
        .update(agentRunRequests)
        .set({ deliveredAt: sql`now()` })
        .where(eq(agentRunRequests.id, requestId));
    else if (status === "failed" && current === "resolved")
      // The answer could not reach the harness, usually after its 10-minute wait.
      await tx
        .update(agentRunRequests)
        .set({ status: "expired", response: null })
        .where(eq(agentRunRequests.id, requestId));
    else if (status === "cancelled" && current === "pending")
      await tx
        .update(agentRunRequests)
        .set({ status: "cancelled", resolvedAt: sql`now()` })
        .where(eq(agentRunRequests.id, requestId));
  });
}

/** Answers the owner gave that this device must pass to its harness. */
export function pendingDeliveries(db: DatabaseExecutor, identity: DeviceIdentity) {
  return db.transaction(async (tx): Promise<AgentRunDelivery[]> => {
    const device = await requireDevice(tx, identity);
    const rows = await tx
      .select({
        requestId: agentRunRequests.id,
        runId: agentRunRequests.runId,
        nativeRequestId: agentRunRequests.nativeRequestId,
        response: agentRunRequests.response,
      })
      .from(agentRunRequests)
      .innerJoin(agentRuns, eq(agentRuns.id, agentRunRequests.runId))
      .where(
        and(
          eq(agentRuns.ownerUserId, identity.userId),
          eq(agentRuns.organizationId, identity.organizationId),
          eq(agentRuns.deviceId, device.id),
          eq(agentRuns.status, "running"),
          eq(agentRunRequests.status, "resolved"),
          isNull(agentRunRequests.deliveredAt),
        ),
      )
      .orderBy(asc(agentRunRequests.resolvedAt));
    return rows.flatMap(({ response, ...row }) => (response ? [{ ...row, response }] : []));
  });
}

/** Ends a run. A run the owner cancelled stays cancelled. */
export function finishRun(
  db: DatabaseExecutor,
  identity: DeviceIdentity,
  input: { runId: string; status: "completed" | "failed" | "cancelled"; error?: string },
) {
  return db.transaction(async (tx) => {
    const device = await requireDevice(tx, identity);
    const run = await requireHeldRun(tx, identity, device.id, input.runId);
    await tx
      .update(agentRuns)
      .set({
        status: run.status === "cancelled" ? "cancelled" : input.status,
        finishedAt: run.finishedAt ?? sql`now()`,
        leaseExpiresAt: null,
        error: input.error?.slice(0, 2000) ?? null,
        activity: null,
      })
      .where(eq(agentRuns.id, run.id));
    await cancelOpenRequests(tx, run.id);
  });
}
