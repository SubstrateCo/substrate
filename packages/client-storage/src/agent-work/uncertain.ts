import { turnMachine } from "@substrate/contracts/agent-work";

import type { LocalTransaction } from "../database.ts";
import { inbox, turns } from "../schema/index.ts";
import { appendEvents } from "./events.ts";
import { inStates } from "./machine-sql.ts";
import { and, eq } from "drizzle-orm";

/** The event that ends the turn as it was before uncertain input made it need the owner. */
function settledEvent(turn: Pick<typeof turns.$inferSelect, "interruption">) {
  if (turn.interruption === "stop") return "settleCancelled";
  return turn.interruption ? "settleInterrupted" : "settleCompleted";
}

/**
 * A turn that needs the owner only for its uncertain input settles once the owner resent or
 * discarded each of those items. A turn that still holds its own batch, such as after a crash,
 * keeps waiting for Retry or Dismiss.
 */
export async function settleUncertainTurn(tx: LocalTransaction, turnId: string, now: number) {
  const turn = await tx.select().from(turns).where(eq(turns.id, turnId)).get();
  if (turn?.status !== "needs_attention" || turn.attentionReason !== "uncertain_input") return;
  const open = await tx
    .select({ status: inbox.status, steered: inbox.steered })
    .from(inbox)
    .where(eq(inbox.turnId, turnId))
    .all();
  const waiting = open.some(
    (row) => row.status === "uncertain" || (row.status === "submitted" && !row.steered),
  );
  if (waiting) return;
  const event = settledEvent(turn);
  const status = turnMachine.events[event].to;
  await tx
    .update(turns)
    .set({ status, attentionReason: null, finishedAt: now })
    .where(and(eq(turns.id, turnId), inStates(turns.status, turnMachine.from(event))));
  await appendEvents(
    tx,
    turnId,
    [{ kind: "turn_finished", data: { status, outcome: turn.outcome } }],
    now,
  );
}
