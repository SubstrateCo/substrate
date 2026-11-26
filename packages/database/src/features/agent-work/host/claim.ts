import { inboxLaneAgingMs, inboxLanes, triggerRegistry } from "@substrate/contracts/agent-work";
import type { HostTurn } from "@substrate/contracts/agent-work/control";
import { realtimeKeys } from "@substrate/contracts/realtime";

import { activeActorCondition } from "../../../core/actors/access";
import { actors } from "../../../core/actors/schema";
import { userAgents } from "../../../core/actors/user-agents.schema";
import { effectsFor } from "../../../core/effects";
import type { DatabaseExecutor } from "../../../core/executor";
import type { ResolvedDeviceIdentity } from "../../../core/session/device";
import { claimableStatuses, setItemStatus, startingSources, type ItemRow } from "../items";
import { folderKey, setSessionStatus, type SessionRow } from "../sessions";
import { agentSessions } from "../sessions.schema";
import { agentTurns } from "../turns.schema";
import { agentWorkItems } from "../work-items.schema";
import { liveStatuses } from "./held-turn";
import { sweepExpiredLeases } from "./lease";
import { leaseUntil } from "./lease-time";
import { hostTurns } from "./views";
import { and, eq, exists, inArray, isNull, lte, ne } from "drizzle-orm";

/** Live turns per device and organization. Main slots go before helper slots. */
const deviceTurnCap = 3;
/** Items batched into one turn. */
const turnBatchLimit = 20;

export interface ClaimOptions {
  /** Folders the host holds without a live turn, such as during native compaction. */
  busyFolders?: string[];
  deviceCap?: number;
  batchLimit?: number;
}

function effectiveLane(item: ItemRow, now: Date) {
  const lane = inboxLanes.indexOf(item.lane);
  if (item.lane !== "background") return lane;
  const waited = Math.max(0, now.getTime() - item.availableAt.getTime());
  return Math.max(0, lane - Math.floor(waited / inboxLaneAgingMs));
}

/** Claim order inside a lane: requeued items first, then the longest waiting. */
function itemOrder(a: ItemRow, b: ItemRow) {
  const front =
    Number(b.status === "confirmed_unconsumed") - Number(a.status === "confirmed_unconsumed");
  return (
    front ||
    a.availableAt.getTime() - b.availableAt.getTime() ||
    a.createdAt.getTime() - b.createdAt.getTime() ||
    a.id.localeCompare(b.id)
  );
}

/** The owner's enabled agents homed on this device, with their actor in the organization. */
function homedEnabledAgents(db: DatabaseExecutor, identity: ResolvedDeviceIdentity) {
  return db
    .select({ id: userAgents.id })
    .from(userAgents)
    .innerJoin(actors, eq(actors.userAgentId, userAgents.id))
    .where(
      and(
        eq(userAgents.userId, identity.userId),
        eq(userAgents.homeDeviceId, identity.deviceId),
        eq(userAgents.enabled, true),
        isNull(userAgents.deletedAt),
        eq(actors.organizationId, identity.organizationId),
        activeActorCondition(),
      ),
    );
}

/** The owner's agents without a home that have work waiting here move to this device. */
async function adoptHomeless(db: DatabaseExecutor, identity: ResolvedDeviceIdentity, now: Date) {
  const adopted = await db
    .update(userAgents)
    .set({ homeDeviceId: identity.deviceId })
    .where(
      and(
        eq(userAgents.userId, identity.userId),
        isNull(userAgents.homeDeviceId),
        isNull(userAgents.deletedAt),
        exists(
          db
            .select({ id: agentWorkItems.id })
            .from(agentWorkItems)
            .where(
              and(
                eq(agentWorkItems.userAgentId, userAgents.id),
                eq(agentWorkItems.organizationId, identity.organizationId),
                inArray(agentWorkItems.status, claimableStatuses),
                lte(agentWorkItems.availableAt, now),
              ),
            ),
        ),
      ),
    )
    .returning({ id: userAgents.id });
  if (adopted.length)
    effectsFor(db).hint({ audience: realtimeKeys.user(identity.userId), domain: "agents" });
}

/**
 * Starts turns for this device's free slots: at most deviceCap live turns per device and
 * organization, and one live turn per folder. Each slot takes the session with the best waiting
 * item (owner, then system, then background with aging; main folders before helper folders) and
 * batches that session's available items. A session whose turn needs the owner waits. A pending
 * epoch item runs alone, as the session's handoff turn. Expired leases end first, so their work
 * can run again.
 */
export async function claimTurns(
  db: DatabaseExecutor,
  identity: ResolvedDeviceIdentity,
  options: ClaimOptions = {},
  now = new Date(),
): Promise<HostTurn[]> {
  const cap = options.deviceCap ?? deviceTurnCap;
  const limit = options.batchLimit ?? turnBatchLimit;
  await sweepExpiredLeases(db, now, { ownerUserId: identity.userId });
  await adoptHomeless(db, identity, now);
  const live = await db
    .select({
      folderKey: agentTurns.folderKey,
      leaseDeviceId: agentTurns.leaseDeviceId,
      organizationId: agentTurns.organizationId,
    })
    .from(agentTurns)
    .where(
      and(eq(agentTurns.ownerUserId, identity.userId), inArray(agentTurns.status, liveStatuses)),
    );
  const driven = live.filter(
    (turn) =>
      turn.leaseDeviceId === identity.deviceId && turn.organizationId === identity.organizationId,
  );
  let free = cap - driven.length;
  if (free <= 0) return [];
  const busy = new Set([...live.map((turn) => turn.folderKey), ...(options.busyFolders ?? [])]);
  // Claims lock the items they consider, so a concurrent claim skips them instead of waiting.
  const rows = await db
    .select({ item: agentWorkItems, session: agentSessions })
    .from(agentWorkItems)
    .innerJoin(agentSessions, eq(agentSessions.id, agentWorkItems.sessionId))
    .where(
      and(
        eq(agentWorkItems.organizationId, identity.organizationId),
        eq(agentWorkItems.ownerUserId, identity.userId),
        inArray(agentWorkItems.userAgentId, homedEnabledAgents(db, identity)),
        inArray(agentWorkItems.status, claimableStatuses),
        inArray(agentWorkItems.source, startingSources),
        lte(agentWorkItems.availableAt, now),
        ne(agentSessions.status, "closed"),
      ),
    )
    .for("update", { of: agentWorkItems, skipLocked: true });
  if (!rows.length) return [];
  // A session whose turn needs the owner waits until the owner resolves it.
  const blocked = new Set(
    (
      await db
        .select({ sessionId: agentTurns.sessionId })
        .from(agentTurns)
        .where(
          and(
            eq(agentTurns.status, "needs_attention"),
            inArray(agentTurns.sessionId, [...new Set(rows.map((row) => row.session.id))]),
          ),
        )
    ).map((row) => row.sessionId),
  );
  const groups = new Map<string, { session: SessionRow; items: ItemRow[] }>();
  for (const row of rows) {
    if (blocked.has(row.session.id)) continue;
    const group = groups.get(row.session.id) ?? { session: row.session, items: [] };
    group.items.push(row.item);
    groups.set(row.session.id, group);
  }
  const ranked = [...groups.values()].map((group) => {
    group.items.sort(itemOrder);
    // The first of equal items wins, as the items are in claim order.
    const best = group.items.reduce((a, b) =>
      (effectiveLane(a, now) - effectiveLane(b, now) || itemOrder(a, b)) <= 0 ? a : b,
    );
    return {
      ...group,
      best,
      lane: effectiveLane(best, now),
      helper: group.session.kind === "helper",
    };
  });
  ranked.sort(
    (a, b) => a.lane - b.lane || Number(a.helper) - Number(b.helper) || itemOrder(a.best, b.best),
  );
  const claimed: string[] = [];
  for (const group of ranked) {
    if (free <= 0) break;
    const folder = folderKey(group.session);
    if (busy.has(folder)) continue;
    // A pending rotation runs alone: the turn that hands the epoch off.
    const rotation = group.items.find((item) => item.source === "epoch");
    const batch = rotation ? [rotation] : group.items.slice(0, limit);
    const interactive =
      group.session.kind !== "helper" &&
      !rotation &&
      batch.some((item) => triggerRegistry[item.source].turnMode === "interactive");
    const recovery = batch.find((item) => item.sourceRef.source === "recovery");
    const [turn] = await db
      .insert(agentTurns)
      .values({
        organizationId: group.session.organizationId,
        userAgentId: group.session.userAgentId,
        agentActorEntityId: group.session.agentActorEntityId,
        ownerUserId: group.session.ownerUserId,
        sessionId: group.session.id,
        folderKey: folder,
        kind: interactive ? "interactive" : "unattended",
        handoff: Boolean(rotation),
        resetGeneration: group.session.resetGeneration,
        resumesTurnId: recovery?.sourceRef.source === "recovery" ? recovery.sourceRef.turnId : null,
        requestAnchors: batch.flatMap((item) =>
          item.sourceRef.source === "answer" || item.sourceRef.source === "approval_result"
            ? [
                {
                  requestId: item.sourceRef.requestId,
                  anchorMessageId: item.sourceRef.anchorMessageId,
                },
              ]
            : [],
        ),
        leaseDeviceId: identity.deviceId,
        leaseExpiresAt: leaseUntil(now),
        createdAt: now,
      })
      // The live-folder index is the arbiter: a turn that another claim started first wins.
      .onConflictDoNothing()
      .returning({ id: agentTurns.id });
    busy.add(folder);
    if (!turn) continue;
    await setItemStatus(
      db,
      batch.map((item) => item.id),
      "submit",
      { turnId: turn.id, held: false },
    );
    await setSessionStatus(db, group.session.id, "work", now);
    free--;
    claimed.push(turn.id);
  }
  if (claimed.length)
    effectsFor(db).hint({ audience: realtimeKeys.user(identity.userId), domain: "agent-work" });
  return hostTurns(db, claimed);
}
