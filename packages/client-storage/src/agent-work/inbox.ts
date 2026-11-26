import {
  inboxItemMachine,
  sessionKeys,
  inboxSources,
  triggerRegistry,
  type InboxStatus,
  type TurnStatus,
} from "@substrate/contracts/agent-work";

import type { LocalTransaction, RunTransaction } from "../database.ts";
import { inbox, sessions, turns } from "../schema/index.ts";
import { enqueue, type NewInboxItem } from "./enqueue.ts";
import { appendEvents, type NewTurnEvent } from "./events.ts";
import { inStates } from "./machine-sql.ts";
import { settleUncertainTurn } from "./uncertain.ts";
import { and, eq, inArray, lte, sql } from "drizzle-orm";

export type InboxRow = typeof inbox.$inferSelect;

/** Dedupe keys of items the desktop creates itself. Server wakes use wakeDedupeKeys. */
export const localDedupeKeys = {
  routine: (routineId: string, revision: number, scheduledAt: string) =>
    `${sessionKeys.routine(routineId)}:${revision}:${scheduledAt}`,
  helperTask: (helperId: string) => `${sessionKeys.helper(helperId)}:task`,
  /** Unique for every message, because the parent may send the same text again. */
  helperMessage: (helperId: string) =>
    `${sessionKeys.helper(helperId)}:message:${crypto.randomUUID()}`,
  helperResult: (helperId: string) => `${sessionKeys.helper(helperId)}:result`,
  recovery: (turnId: string, attempt: number) => `recovery:${turnId}:${attempt}`,
  epoch: (sessionId: string, epoch: number) => `epoch:${sessionId}:${epoch}`,
};

/** Items that can still start a turn. confirmed_unconsumed items go first in their lane. */
export const claimableStatuses: InboxStatus[] = ["pending", "confirmed_unconsumed"];
/** Items not yet in a finished turn. */
const openStatuses: InboxStatus[] = ["pending", "submitted", "confirmed_unconsumed", "uncertain"];

export type InboxEvent = keyof typeof inboxItemMachine.events;

/** Fires the event for the items that are still in one of its from states. */
export async function setItemStatus(
  tx: LocalTransaction,
  ids: string[],
  event: InboxEvent,
  extra: Partial<Pick<InboxRow, "reason" | "held" | "turnId" | "steered">> = {},
) {
  if (ids.length)
    await tx
      .update(inbox)
      .set({ status: inboxItemMachine.events[event].to, ...extra })
      .where(and(inArray(inbox.id, ids), inStates(inbox.status, inboxItemMachine.from(event))));
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
    intake: <T extends NewInboxItem>(items: T[], now: number) =>
      run(async (tx) => {
        const created: InboxRow[] = [];
        for (const item of items) {
          const row = await enqueue(tx, item, now);
          if (row) created.push(row);
        }
        return created;
      }),
    get: (organizationId: string, id: string) =>
      run((tx) =>
        tx
          .select()
          .from(inbox)
          .where(and(eq(inbox.organizationId, organizationId), eq(inbox.id, id)))
          .get(),
      ),
    forTurn: (organizationId: string, turnId: string) =>
      run((tx) =>
        tx
          .select()
          .from(inbox)
          .where(and(eq(inbox.organizationId, organizationId), eq(inbox.turnId, turnId)))
          .all(),
      ),
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
              eq(inbox.organizationId, organizationId),
              inArray(
                inbox.source,
                inboxSources.filter((source) => triggerRegistry[source].steerable),
              ),
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
        const turn = await tx.select().from(turns).where(eq(turns.id, turnId)).get();
        if (!turn || !steerableTurnStatuses.includes(turn.status)) return false;
        const item = await tx.select().from(inbox).where(eq(inbox.id, id)).get();
        if (
          !item ||
          item.organizationId !== turn.organizationId ||
          item.sessionId !== turn.sessionId
        )
          return false;
        if (item.sourceRef.source === "thread_context" && item.sourceRef.targetTurnId !== turnId)
          return false;
        const updated = await tx
          .update(inbox)
          .set({ status: inboxItemMachine.events.submit.to, steered: true, held: false, turnId })
          .where(and(eq(inbox.id, id), inStates(inbox.status, inboxItemMachine.from("submit"))))
          .returning({ id: inbox.id });
        return updated.length > 0;
      }),
    /** The steer command failed: the item was not delivered and waits again. */
    revertSteer: (id: string, turnId: string, now: number) =>
      run(async (tx) => {
        await tx
          .update(inbox)
          .set({
            status: inboxItemMachine.events.revertSteer.to,
            steered: false,
            turnId: null,
            reason: null,
          })
          .where(
            and(
              eq(inbox.id, id),
              eq(inbox.turnId, turnId),
              eq(inbox.steered, true),
              inStates(inbox.status, inboxItemMachine.from("revertSteer")),
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
          .set({
            status: inboxItemMachine.events.unconfirm.to,
            held: false,
            reason: "steer_unconfirmed",
          })
          .where(
            and(
              eq(inbox.id, id),
              eq(inbox.turnId, turnId),
              eq(inbox.steered, true),
              inStates(inbox.status, inboxItemMachine.from("unconfirm")),
            ),
          ),
      ),
    hold: (organizationId: string, ids: string[]) =>
      run(async (tx) => {
        if (ids.length)
          await tx
            .update(inbox)
            .set({ held: true })
            .where(and(eq(inbox.organizationId, organizationId), inArray(inbox.id, ids)));
      }),
    /**
     * The harness reported that it read the item. Evidence that arrives after the turn settled
     * the item as uncertain still applies. The turn's events for it land in the same transaction.
     */
    consumed: (turnId: string, inputId: string, now: number, events: NewTurnEvent[] = []) =>
      run(async (tx) => {
        await tx
          .update(inbox)
          .set({ status: inboxItemMachine.events.consume.to, reason: null })
          .where(
            and(
              eq(inbox.id, inputId),
              eq(inbox.turnId, turnId),
              inStates(inbox.status, inboxItemMachine.from("consume")),
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
            status: inboxItemMachine.events.resend.to,
            steered: false,
            held: false,
            turnId: null,
            reason: null,
            availableAt: now,
            deadlineAt: now,
          })
          .where(and(eq(inbox.id, id), inStates(inbox.status, inboxItemMachine.from("resend"))));
        if (row.turnId) await settleUncertainTurn(tx, row.turnId, now);
        return row;
      }),
    /** The owner decides an uncertain item needs nothing more. */
    discard: (id: string, now: number) =>
      run(async (tx) => {
        const row = await uncertainItem(tx, id);
        await setItemStatus(tx, [id], "discard", { reason: "discarded", held: false });
        if (row.turnId) await settleUncertainTurn(tx, row.turnId, now);
        return row;
      }),
    drop: (organizationId: string, ids: string[], reason: string) =>
      run(async (tx) => {
        const owned = await tx
          .select({ id: inbox.id })
          .from(inbox)
          .where(and(eq(inbox.organizationId, organizationId), inArray(inbox.id, ids)))
          .all();
        await setItemStatus(
          tx,
          owned.map((row) => row.id),
          "drop",
          { reason, held: false },
        );
      }),
    /**
     * The agent already got this item's news inside a turn, such as a held tool call that
     * returned the owner's decision. Keeps the dedupe key as a dropped item, so that the server
     * wake with this key, before or after a restart, starts and joins no turn. A pending item
     * that intake already created is dropped; one already delivered stays as it is.
     */
    deliveredInTurn: (item: NewInboxItem, now: number) =>
      run(async (tx) => {
        await enqueue(tx, item, now);
        const session = await tx
          .select({ organizationId: sessions.organizationId })
          .from(sessions)
          .where(eq(sessions.id, item.sessionId))
          .get();
        await tx
          .update(inbox)
          .set({
            status: inboxItemMachine.events.drop.to,
            reason: "delivered_in_turn",
            held: false,
          })
          .where(
            and(
              eq(inbox.organizationId, session!.organizationId),
              eq(inbox.userAgentId, item.userAgentId),
              eq(inbox.dedupeKey, item.dedupeKey),
              inStates(inbox.status, inboxItemMachine.from("drop")),
              // A submitted or consumed item may already be in a turn's input.
              eq(inbox.status, "pending"),
            ),
          );
      }),
    /** Counts claimable items per agent, for status. */
    queuedCounts: (organizationId: string) =>
      run(async (tx) => {
        const rows = await tx
          .select({ userAgentId: inbox.userAgentId, count: sql<number>`count(*)` })
          .from(inbox)
          .where(
            and(
              eq(inbox.organizationId, organizationId),
              inArray(inbox.status, claimableStatuses),
              inArray(
                inbox.source,
                inboxSources.filter((source) => triggerRegistry[source].canStartTurn),
              ),
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
          .where(and(eq(inbox.organizationId, organizationId), eq(inbox.status, "uncertain")))
          .groupBy(inbox.userAgentId)
          .all();
        return new Map(rows.map((row) => [row.userAgentId, Number(row.count)]));
      }),
  };
}
