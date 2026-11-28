import { turnMachine } from "@substrate/contracts/agent-work";

import type { DatabaseExecutor } from "../../../core/executor";
import { inStates } from "../machine-sql";
import { agentTurns } from "../turns.schema";
import { agentWorkItems } from "../work-items.schema";
import type { TurnRow } from "./held-turn";
import { and, eq } from "drizzle-orm";

function settledEvent(turn: Pick<TurnRow, "interruption">) {
  if (turn.interruption === "stop") return "settleCancelled";
  return turn.interruption ? "settleInterrupted" : "settleCompleted";
}

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
