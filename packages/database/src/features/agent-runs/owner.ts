import {
  responseMatchesPayload,
  type AgentRunDetail,
  type AgentRunRequestResponse,
  type AgentRunView,
} from "@startup-os/contracts/agent-runs";

import type { DatabaseExecutor } from "../../client";
import { actors } from "../../core/actors/schema";
import { deviceOnline } from "../../core/devices/repository";
import { desktopDevices } from "../../core/devices/schema";
import { AccessDeniedError, ConflictError, ValidationError } from "../../errors";
import { workspaceContext } from "../context/access";
import { visibleConversations } from "../messaging/access";
import { messagingConversations } from "../messaging/schema";
import { cancelOpenRequests, sweepRuns } from "./lifecycle";
import {
  agentRunEvents,
  agentRunReplies,
  agentRunRequests,
  agentRunTriggers,
  agentRuns,
} from "./schema";
import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";

export interface OwnerIdentity {
  userId: string;
  organizationId: string;
}

const iso = (value: Date | null) => value?.toISOString() ?? null;

// The owner sees their runs only while they can still see the conversation.
function ownedRuns(db: DatabaseExecutor, identity: OwnerIdentity) {
  return and(
    eq(agentRuns.ownerUserId, identity.userId),
    eq(agentRuns.organizationId, identity.organizationId),
    inArray(
      agentRuns.conversationId,
      db
        .select({ id: messagingConversations.id })
        .from(messagingConversations)
        .where(visibleConversations(db, identity)),
    ),
  );
}

async function views(db: DatabaseExecutor, where: SQL | undefined) {
  const rows = await db
    .select({
      run: agentRuns,
      agentName: actors.name,
      device: {
        id: desktopDevices.id,
        name: desktopDevices.name,
        online: deviceOnline,
      },
    })
    .from(agentRuns)
    .innerJoin(actors, eq(actors.entityId, agentRuns.agentActorEntityId))
    .leftJoin(desktopDevices, eq(desktopDevices.id, agentRuns.deviceId))
    .where(where)
    .orderBy(desc(agentRuns.createdAt), desc(agentRuns.id))
    .limit(100);
  const ids = rows.map((row) => row.run.id);
  const [triggers, replies, requests] = ids.length
    ? await Promise.all([
        db
          .select({ runId: agentRunTriggers.runId, messageId: agentRunTriggers.messageId })
          .from(agentRunTriggers)
          .where(inArray(agentRunTriggers.runId, ids))
          .orderBy(asc(agentRunTriggers.createdAt)),
        db
          .select({ runId: agentRunReplies.runId, messageId: agentRunReplies.messageId })
          .from(agentRunReplies)
          .where(inArray(agentRunReplies.runId, ids))
          .orderBy(asc(agentRunReplies.createdAt), asc(agentRunReplies.messageId)),
        db
          .select()
          .from(agentRunRequests)
          .where(inArray(agentRunRequests.runId, ids))
          .orderBy(asc(agentRunRequests.createdAt)),
      ])
    : [[], [], []];
  return rows.map(({ run, agentName, device }): AgentRunView => ({
    id: run.id,
    agent: { actorId: run.agentActorEntityId, agentId: run.userAgentId, name: agentName },
    conversationId: run.conversationId,
    threadId: run.threadId,
    status: run.status,
    triggerKind: run.triggerKind,
    triggerMessageIds: triggers.filter((row) => row.runId === run.id).map((row) => row.messageId),
    replyMessageIds: replies.filter((row) => row.runId === run.id).map((row) => row.messageId),
    activity: run.activity,
    error: run.error,
    device: device?.id ? device : null,
    createdAt: run.createdAt.toISOString(),
    startedAt: iso(run.startedAt),
    finishedAt: iso(run.finishedAt),
    expiresAt: run.expiresAt.toISOString(),
    requests: requests
      .filter((request) => request.runId === run.id)
      .map((request) => ({
        id: request.id,
        runId: request.runId,
        status: request.status,
        payload: request.payload,
        response: request.response,
        createdAt: request.createdAt.toISOString(),
        resolvedAt: iso(request.resolvedAt),
      })),
  }));
}

/** The owner's runs in one conversation: every active run and the latest finished ones. */
export function listConversationRuns(
  db: DatabaseExecutor,
  identity: OwnerIdentity,
  conversationId: string,
) {
  return db.transaction(async (tx) => {
    await workspaceContext(tx, identity);
    await sweepRuns(tx, identity.userId);
    return views(tx, and(ownedRuns(tx, identity), eq(agentRuns.conversationId, conversationId)));
  });
}

/** The owner's active runs across conversations, for the desktop's status views. */
export function listActiveRuns(db: DatabaseExecutor, identity: OwnerIdentity) {
  return db.transaction(async (tx) => {
    await workspaceContext(tx, identity);
    await sweepRuns(tx, identity.userId);
    return views(
      tx,
      and(ownedRuns(tx, identity), inArray(agentRuns.status, ["queued", "running"])),
    );
  });
}

export function getRun(db: DatabaseExecutor, identity: OwnerIdentity, runId: string) {
  return db.transaction(async (tx): Promise<AgentRunDetail> => {
    await workspaceContext(tx, identity);
    await sweepRuns(tx, identity.userId);
    const [run] = await views(tx, and(ownedRuns(tx, identity), eq(agentRuns.id, runId)));
    if (!run) throw new AccessDeniedError();
    const events = await tx
      .select()
      .from(agentRunEvents)
      .where(eq(agentRunEvents.runId, runId))
      .orderBy(asc(agentRunEvents.sequence))
      .limit(2000);
    return {
      ...run,
      events: events.map((event) => ({
        sequence: event.sequence,
        kind: event.kind,
        text: event.text,
        createdAt: event.createdAt.toISOString(),
      })),
    };
  });
}

async function requireOwnedRun(db: DatabaseExecutor, identity: OwnerIdentity, runId: string) {
  const [run] = await db
    .select()
    .from(agentRuns)
    .where(and(ownedRuns(db, identity), eq(agentRuns.id, runId)))
    .for("update");
  if (!run) throw new AccessDeniedError();
  return run;
}

/** Stops a queued run, or asks the device to interrupt a running one at its next heartbeat. */
export function cancelRun(db: DatabaseExecutor, identity: OwnerIdentity, runId: string) {
  return db.transaction(async (tx) => {
    await workspaceContext(tx, identity);
    const run = await requireOwnedRun(tx, identity, runId);
    if (run.status !== "queued" && run.status !== "running")
      throw new ConflictError("This run has already stopped.");
    await tx
      .update(agentRuns)
      .set({ status: "cancelled", finishedAt: sql`now()`, leaseExpiresAt: null })
      .where(eq(agentRuns.id, runId));
    await cancelOpenRequests(tx, runId);
    return { cancelled: true };
  });
}

/**
 * Records the owner's answer. The first answer wins; any open window can answer.
 * The device delivers it to the harness afterwards.
 */
export function respondToRequest(
  db: DatabaseExecutor,
  identity: OwnerIdentity,
  requestId: string,
  response: AgentRunRequestResponse,
) {
  return db.transaction(async (tx) => {
    await workspaceContext(tx, identity);
    await sweepRuns(tx, identity.userId);
    const [row] = await tx
      .select({ request: agentRunRequests, runStatus: agentRuns.status })
      .from(agentRunRequests)
      .innerJoin(agentRuns, eq(agentRuns.id, agentRunRequests.runId))
      .where(and(eq(agentRunRequests.id, requestId), ownedRuns(tx, identity)))
      .for("update", { of: agentRunRequests });
    if (!row) throw new AccessDeniedError();
    if (row.request.status !== "pending" || row.runStatus !== "running")
      throw new ConflictError("This request was already answered or has closed.");
    if (!responseMatchesPayload(row.request.payload, response))
      throw new ValidationError("Choose one of the offered answers.");
    await tx
      .update(agentRunRequests)
      .set({
        status: "resolved",
        response,
        resolvedAt: sql`now()`,
        resolvedByUserId: identity.userId,
      })
      .where(eq(agentRunRequests.id, requestId));
    return { resolved: true };
  });
}
