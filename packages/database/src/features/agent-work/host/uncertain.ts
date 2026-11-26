import { turnMachine } from "@substrate/contracts/agent-work";

import type { DatabaseExecutor } from "../../../core/executor";
import { inStates } from "../machine-sql";
import { agentTurns } from "../turns.schema";
import { agentWorkItems } from "../work-items.schema";
import type { TurnRow } from "./held-turn";
import { and, eq } from "drizzle-orm";

/** The event that ends the turn as it was before uncertain input made it need the owner. */
function settledEvent(turn: Pick<TurnRow, "interruption">) {
  if (turn.interruption === "stop") return "settleCancelled";
  return turn.interruption ? "settleInterrupted" : "settleCompleted";
}

/**
 * A turn that needs the owner only for its uncertain input settles once each of those items was
 * consumed, resent, discarded or sent again. A turn that still holds its own batch, such as after
 * a crash, keeps waiting for Retry or Dismiss.
 */
export async function settleUncertainTurn(db: DatabaseExecutor, turnId: string, now: Date) {
  const [turn] = await db.select().from(agentTurns).where(eq(agentTurns.id, turnId));
  if (turn?.status !== "needs_attention" || turn.attentionReason !== "uncertain_input") return;
  const open = await db
    .select({ status: agentWorkItems.status, steered: agentWorkItems.steered })
    .from(agentWorkItems)
    .where(eq(agentWorkItems.turnId, turnId));
  const waiting = open.some(
    (row) => row.status === "uncertain" || (row.status === "submitted" && !row.steered),
  );
  if (waiting) return;
  const event = settledEvent(turn);
  await db
    .update(agentTurns)
    .set({ status: turnMachine.events[event].to, attentionReason: null, finishedAt: now })
    .where(and(eq(agentTurns.id, turnId), inStates(agentTurns.status, turnMachine.from(event))));
}
