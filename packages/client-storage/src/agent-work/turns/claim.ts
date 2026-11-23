import {
  inboxItemMachine,
  inboxLaneAgingMs,
  inboxLanes,
  inboxSources,
  liveTurnStatuses,
  triggerRegistry,
} from "@substrate/contracts/agent-work";

import type { LocalTransaction } from "../../database.ts";
import { inbox, sessions, turns } from "../../schema/index.ts";
import { claimableStatuses, setItemStatus, type InboxRow } from "../inbox.ts";
import { folderKey, setSessionStatus, type SessionRow } from "../sessions.ts";
import { and, eq, inArray, lte, ne } from "drizzle-orm";

export type TurnRow = typeof turns.$inferSelect;

/** Live turns on one device. Main slots go before helper slots. */
const deviceTurnCap = 3;
/** Items batched into one turn. */
const turnBatchLimit = 20;
const liveStatuses = [...liveTurnStatuses];

/**
 * Claims take one organization's work. The device cap counts the live turns of that
 * organization: the turns its runtime drives. Other organizations' rows wait for their runtime.
 */
export interface ClaimOptions {
  deviceCap?: number;
  batchLimit?: number;
  organizationId: string;
  /** Folders the runtime holds without a live turn, such as during native compaction. */
  busyFolders?: string[];
  /** Only these agents run here, such as the agents homed on this desktop. */
  userAgentIds?: string[];
}

export interface ClaimedTurn {
  turn: TurnRow;
  session: SessionRow;
  items: InboxRow[];
}

function effectiveLane(item: InboxRow, now: number) {
  const lane = inboxLanes.indexOf(item.lane);
  if (item.lane !== "background") return lane;
  return Math.max(0, lane - Math.floor(Math.max(0, now - item.availableAt) / inboxLaneAgingMs));
}

/** Claim order inside a lane: requeued items first, then the longest waiting. */
function itemOrder(a: InboxRow, b: InboxRow) {
  const front =
    Number(b.status === "confirmed_unconsumed") - Number(a.status === "confirmed_unconsumed");
  return front || a.availableAt - b.availableAt || a.createdAt - b.createdAt;
}

/** The pending rotation item of the session's current epoch, which runs alone. */
function rotationItem(session: SessionRow, items: InboxRow[]) {
  if (!session.rotation) return undefined;
  return items.find(
    (item) => item.sourceRef.source === "epoch" && item.sourceRef.fromEpoch === session.epoch,
  );
}

/**
 * Starts turns for free slots: one live turn per folder and at most deviceCap live turns. Each
 * slot takes the session with the best waiting item (owner, then system, then background with
 * aging; main folders before helper folders) and batches that session's available items.
 */
export async function claimTurns(
  tx: LocalTransaction,
  now: number,
  options: ClaimOptions,
): Promise<ClaimedTurn[]> {
  const cap = options.deviceCap ?? deviceTurnCap;
  const limit = options.batchLimit ?? turnBatchLimit;
  const live = await tx
    .select({ folderKey: turns.folderKey, organizationId: turns.organizationId })
    .from(turns)
    .where(inArray(turns.status, liveStatuses))
    .all();
  const driven = live.filter((turn) => turn.organizationId === options.organizationId);
  let free = cap - driven.length;
  if (free <= 0 || options.userAgentIds?.length === 0) return [];
  const busy = new Set([...live.map((turn) => turn.folderKey), ...(options.busyFolders ?? [])]);
  const rows = await tx
    .select({ item: inbox, session: sessions })
    .from(inbox)
    .innerJoin(sessions, eq(sessions.id, inbox.sessionId))
    .where(
      and(
        inArray(inbox.status, claimableStatuses),
        inArray(
          inbox.source,
          inboxSources.filter((source) => triggerRegistry[source].canStartTurn),
        ),
        lte(inbox.availableAt, now),
        ne(sessions.status, "closed"),
        eq(sessions.organizationId, options.organizationId),
        options.userAgentIds === undefined
          ? undefined
          : inArray(sessions.userAgentId, options.userAgentIds),
      ),
    )
    .all();
  // A session whose turn needs the owner waits until the owner resolves it.
  const blocked = new Set(
    (
      await tx
        .select({ sessionId: turns.sessionId })
        .from(turns)
        .where(
          and(
            eq(turns.status, "needs_attention"),
            eq(turns.organizationId, options.organizationId),
          ),
        )
        .all()
    ).map((row) => row.sessionId),
  );
  const groups = new Map<string, { session: SessionRow; items: InboxRow[] }>();
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
  const claimed: ClaimedTurn[] = [];
  for (const group of ranked) {
    if (free <= 0) break;
    const folder = folderKey(group.session);
    if (busy.has(folder)) continue;
    const rotation = rotationItem(group.session, group.items);
    const batch = rotation
      ? [rotation]
      : group.items
          .filter((item) => item.sourceRef.source !== "epoch" || !group.session.rotation)
          .slice(0, limit);
    if (!batch.length) continue;
    const interactive =
      group.session.kind !== "helper" &&
      !rotation &&
      batch.some((item) => triggerRegistry[item.source].turnMode === "interactive");
    const recovery = batch.find((item) => item.sourceRef.source === "recovery");
    const turn: TurnRow = {
      id: crypto.randomUUID(),
      sessionId: group.session.id,
      userAgentId: group.session.userAgentId,
      organizationId: group.session.organizationId,
      folderKey: folder,
      kind: interactive ? "interactive" : "unattended",
      status: "assigned",
      outcome: null,
      attempt: 1,
      generation: 1,
      epoch: group.session.epoch,
      handoff: Boolean(rotation),
      envelope: null,
      prefixHash: null,
      usage: null,
      eventCount: 0,
      activity: null,
      error: null,
      attentionReason: null,
      interruption: null,
      recoveries: 0,
      autoContinue: true,
      resumesTurnId: recovery?.sourceRef.source === "recovery" ? recovery.sourceRef.turnId : null,
      sourceMessages: [],
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
      createdAt: now,
      startedAt: null,
      finishedAt: null,
    };
    await tx.insert(turns).values(turn);
    await setItemStatus(
      tx,
      batch.map((item) => item.id),
      "submit",
      { turnId: turn.id, held: false },
    );
    await setSessionStatus(tx, group.session.id, "work", now);
    busy.add(folder);
    free--;
    claimed.push({
      turn,
      session: group.session,
      items: batch.map((item) => ({
        ...item,
        status: inboxItemMachine.events.submit.to,
        turnId: turn.id,
        held: false,
      })),
    });
  }
  return claimed;
}
