import type { TurnStatus } from "@substrate/contracts/agent-work";

import type { LocalTransaction } from "../database.ts";
import { inbox, turns } from "../schema/index.ts";
import { appendEvents } from "./events.ts";
import { and, eq } from "drizzle-orm";

/** The status a turn had before uncertain input made it need the owner. */
function settledStatus(turn: Pick<typeof turns.$inferSelect, "interruption">): TurnStatus {
  if (turn.interruption === "stop") return "cancelled";
  return turn.interruption ? "interrupted" : "completed";
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
  const status = settledStatus(turn);
  await tx
    .update(turns)
    .set({ status, attentionReason: null, finishedAt: now })
    .where(and(eq(turns.id, turnId), eq(turns.status, "needs_attention")));
  await appendEvents(
    tx,
    turnId,
    [{ kind: "turn_finished", data: { status, outcome: turn.outcome } }],
    now,
  );
}
