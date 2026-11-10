import type {
  InboxLane,
  InboxSource,
  InboxSourceRef,
  InboxStatus,
  TurnStatus,
} from "@startup-os/contracts/agent-work";

import type { LocalTransaction, RunTransaction } from "../database.ts";
import { inbox, sessions, turns } from "../schema/index.ts";
import { appendEvents, type NewTurnEvent } from "./events.ts";
import { settleUncertainTurn } from "./uncertain.ts";
import { and, eq, inArray, isNull, lte, sql } from "drizzle-orm";

export type InboxRow = typeof inbox.$inferSelect;

/** An owner message waits this long for more messages before its turn can start. */
export const ownerMessageDebounceMs = 500;
/** A batch of owner messages closes this long after its first message. */
export const ownerBatchWindowMs = 2000;

/** Items that can still start a turn. confirmed_unconsumed items go first in their lane. */
export const claimableStatuses: InboxStatus[] = ["pending", "confirmed_unconsumed"];
/** Items not yet in a finished turn. */
const openStatuses: InboxStatus[] = ["pending", "submitted", "confirmed_unconsumed", "uncertain"];

export interface NewInboxItem {
  sessionId: string;
  userAgentId: string;
  source: InboxSource;
  sourceRef: InboxSourceRef;
  lane: InboxLane;
  dedupeKey: string;
  body?: string | null;
  wakeId?: string | null;
  /** Defaults to now. Owner messages are debounced instead. */
  availableAt?: number;
}

/**
 * Inserts an item unless the agent already has one with its dedupe key. Owner messages wait
 * for more messages: each new one moves the batch 500 ms out, up to 2 s after the first.
 */
export async function insertItem(tx: LocalTransaction, item: NewInboxItem, now: number) {
  let availableAt = item.availableAt ?? now;
  let deadlineAt = availableAt;
  const debounced = item.source === "owner_message";
  let batch: InboxRow[] = [];
  if (debounced) {
    batch = await tx
      .select()
      .from(inbox)
      .where(
        and(
          eq(inbox.sessionId, item.sessionId),
          eq(inbox.source, "owner_message"),
          eq(inbox.status, "pending"),
          isNull(inbox.turnId),
        ),
      )
      .all();
    const open = batch.filter((row) => row.availableAt > now);
    deadlineAt = open.length
      ? Math.min(...open.map((row) => row.deadlineAt))
      : now + ownerBatchWindowMs;
    availableAt = Math.min(now + ownerMessageDebounceMs, deadlineAt);
  }
  const inserted = await tx
    .insert(inbox)
    .values({
      id: crypto.randomUUID(),
      sessionId: item.sessionId,
      userAgentId: item.userAgentId,
      source: item.source,
      sourceRef: item.sourceRef,
      body: item.body ?? null,
      wakeId: item.wakeId ?? null,
      lane: item.lane,
      dedupeKey: item.dedupeKey,
      availableAt,
      deadlineAt,
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning();
  const row = inserted.at(0);
  if (row && debounced) {
    const open = batch.filter((entry) => entry.availableAt > now).map((entry) => entry.id);
    if (open.length) await tx.update(inbox).set({ availableAt }).where(inArray(inbox.id, open));
  }
  return row;
}

export async function setItemStatus(
  tx: LocalTransaction,
  ids: string[],
  status: InboxStatus,
  extra: Partial<Pick<InboxRow, "reason" | "held" | "turnId">> = {},
) {
  if (ids.length)
    await tx
      .update(inbox)
      .set({ status, ...extra })
      .where(inArray(inbox.id, ids));
}

/** The organization's sessions, to scope inbox queries: inbox rows have no organization. */
function organizationSessions(tx: LocalTransaction, organizationId: string) {
  return tx
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.organizationId, organizationId));
}

/** Live turns that can take steered input. A stopping turn is ending. */
const steerableTurnStatuses: TurnStatus[] = ["assigned", "running", "waiting"];

async function uncertainItem(tx: LocalTransaction, id: string) {
  const row = await tx.select().from(inbox).where(eq(inbox.id, id)).get();
  if (row?.status !== "uncertain") throw new Error("This message does not need a decision.");
  return row;
}

export function inboxRepository(run: RunTransaction) {
  return {
    /** Inserts items in one transaction. Returns the items that were new. */
    intake: (items: NewInboxItem[], now: number) =>
      run(async (tx) => {
        const created: InboxRow[] = [];
        for (const item of items) {
          const row = await insertItem(tx, item, now);
          if (row) created.push(row);
        }
        return created;
      }),
    get: (id: string) => run((tx) => tx.select().from(inbox).where(eq(inbox.id, id)).get()),
    forTurn: (turnId: string) =>
      run((tx) => tx.select().from(inbox).where(eq(inbox.turnId, turnId)).all()),
    /** Open items of these sessions, oldest first. */
    openForSessions: (sessionIds: string[]) =>
      run(async (tx) =>
        sessionIds.length
          ? tx
              .select()
              .from(inbox)
              .where(and(inArray(inbox.sessionId, sessionIds), inArray(inbox.status, openStatuses)))
              .orderBy(inbox.createdAt)
              .all()
          : [],
      ),
    /** Available owner items that no turn took. Their slot is busy: steer them or hold them. */
    waitingOwnerItems: (organizationId: string, now: number) =>
      run((tx) =>
        tx
          .select()
          .from(inbox)
          .where(
            and(
              inArray(inbox.sessionId, organizationSessions(tx, organizationId)),
              eq(inbox.lane, "owner"),
              inArray(inbox.status, claimableStatuses),
              lte(inbox.availableAt, now),
            ),
          )
          .orderBy(inbox.availableAt)
          .all(),
      ),
    /**
     * Records the item as steered into the turn before the steer command is sent, so that the
     * turn's end and early consumption evidence both see it. False when the turn is no longer
     * live and steerable, or the item was already taken.
     */
    submitSteer: (id: string, turnId: string) =>
      run(async (tx) => {
        const turn = await tx
          .select({ status: turns.status })
          .from(turns)
          .where(eq(turns.id, turnId))
          .get();
        if (!turn || !steerableTurnStatuses.includes(turn.status)) return false;
        const updated = await tx
          .update(inbox)
          .set({ status: "submitted", steered: true, held: false, turnId })
          .where(and(eq(inbox.id, id), inArray(inbox.status, claimableStatuses)))
          .returning({ id: inbox.id });
        return updated.length > 0;
      }),
    /** The steer command failed: the item was not delivered and waits again. */
    revertSteer: (id: string, turnId: string, now: number) =>
      run(async (tx) => {
        await tx
          .update(inbox)
          .set({ status: "pending", steered: false, turnId: null, reason: null })
          .where(
            and(
              eq(inbox.id, id),
              eq(inbox.turnId, turnId),
              eq(inbox.steered, true),
              inArray(inbox.status, ["submitted", "uncertain"]),
            ),
          );
        await settleUncertainTurn(tx, turnId, now);
      }),
    /**
     * The steer command failed in a way that does not tell whether the harness got the item.
     * It is uncertain: the owner resends or discards it; it is never sent again by itself.
     */
    uncertainSteer: (id: string, turnId: string) =>
      run((tx) =>
        tx
          .update(inbox)
          .set({ status: "uncertain", held: false, reason: "steer_unconfirmed" })
          .where(
            and(
              eq(inbox.id, id),
              eq(inbox.turnId, turnId),
              eq(inbox.steered, true),
              eq(inbox.status, "submitted"),
            ),
          ),
      ),
    hold: (ids: string[]) =>
      run(async (tx) => {
        if (ids.length) await tx.update(inbox).set({ held: true }).where(inArray(inbox.id, ids));
      }),
    /**
     * The harness reported that it read the item. Evidence that arrives after the turn settled
     * the item as uncertain still applies. The turn's events for it land in the same transaction.
     */
    consumed: (turnId: string, inputId: string, now: number, events: NewTurnEvent[] = []) =>
      run(async (tx) => {
        await tx
          .update(inbox)
          .set({ status: "consumed", reason: null })
          .where(
            and(
              eq(inbox.id, inputId),
              eq(inbox.turnId, turnId),
              inArray(inbox.status, ["submitted", "uncertain"]),
            ),
          );
        await settleUncertainTurn(tx, turnId, now);
        await appendEvents(tx, turnId, events, now);
      }),
    /** The owner sends an uncertain item again. It waits for the next turn of its session. */
    resend: (id: string, now: number) =>
      run(async (tx) => {
        const row = await uncertainItem(tx, id);
        await tx
          .update(inbox)
          .set({
            status: "pending",
            steered: false,
            held: false,
            turnId: null,
            reason: null,
            availableAt: now,
            deadlineAt: now,
          })
          .where(eq(inbox.id, id));
        if (row.turnId) await settleUncertainTurn(tx, row.turnId, now);
        return row;
      }),
    /** The owner decides an uncertain item needs nothing more. */
    discard: (id: string, now: number) =>
      run(async (tx) => {
        const row = await uncertainItem(tx, id);
        await setItemStatus(tx, [id], "dropped", { reason: "discarded", held: false });
        if (row.turnId) await settleUncertainTurn(tx, row.turnId, now);
        return row;
      }),
    drop: (ids: string[], reason: string) =>
      run((tx) => setItemStatus(tx, ids, "dropped", { reason, held: false })),
    /** Counts claimable items per agent, for status. */
    queuedCounts: (organizationId: string) =>
      run(async (tx) => {
        const rows = await tx
          .select({ userAgentId: inbox.userAgentId, count: sql<number>`count(*)` })
          .from(inbox)
          .where(
            and(
              inArray(inbox.sessionId, organizationSessions(tx, organizationId)),
              inArray(inbox.status, claimableStatuses),
            ),
          )
          .groupBy(inbox.userAgentId)
          .all();
        return new Map(rows.map((row) => [row.userAgentId, Number(row.count)]));
      }),
    /** Counts uncertain items per agent. The owner must decide about each. */
    uncertainCounts: (organizationId: string) =>
      run(async (tx) => {
        const rows = await tx
          .select({ userAgentId: inbox.userAgentId, count: sql<number>`count(*)` })
          .from(inbox)
          .where(
            and(
              inArray(inbox.sessionId, organizationSessions(tx, organizationId)),
              eq(inbox.status, "uncertain"),
            ),
          )
          .groupBy(inbox.userAgentId)
          .all();
        return new Map(rows.map((row) => [row.userAgentId, Number(row.count)]));
      }),
  };
}
