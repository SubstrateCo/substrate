import {
  inboxItemMachine,
  turnMachine,
  type TurnAttentionReason,
  type TurnInterruption,
} from "@substrate/contracts/agent-work";
import { interruptionNote, type RecoveryDecision } from "@substrate/contracts/agent-work/control";

import type { DatabaseExecutor } from "../../../core/executor";
import { setItemStatus } from "../items";
import { inStates } from "../machine-sql";
import { setSessionStatus } from "../sessions";
import { agentTurns } from "../turns.schema";
import { agentWorkItems } from "../work-items.schema";
import { finishTurn, noLease, settleHelper, type FinishTurnInput } from "./finish";
import type { TurnRow } from "./held-turn";
import { leaseUntil } from "./lease-time";
import { and, eq, or } from "drizzle-orm";

export const neverStarted = (turn: TurnRow) =>
  turn.status === "assigned" && turn.startedAt === null && turn.attempt === 1;

export async function requeueTurn(
  db: DatabaseExecutor,
  turn: TurnRow,
  availableAt: Date,
  now: Date,
) {
  const cancelled = await db
    .update(agentTurns)
    .set({ status: turnMachine.events.cancel.to, finishedAt: now, ...noLease })
    .where(
      and(
        eq(agentTurns.id, turn.id),
        eq(agentTurns.status, "assigned"),
        inStates(agentTurns.status, turnMachine.from("cancel")),
      ),
    )
    .returning({ id: agentTurns.id });
  if (!cancelled.length) return false;
  await db
    .update(agentWorkItems)
    .set({
      status: inboxItemMachine.events.unclaim.to,
      turnId: null,
      availableAt,
      deadlineAt: availableAt,
    })
    .where(
      and(
        eq(agentWorkItems.turnId, turn.id),
        inStates(agentWorkItems.status, inboxItemMachine.from("unclaim")),
        eq(agentWorkItems.steered, false),
      ),
    );
  await setSessionStatus(db, turn.sessionId, "rest", now);
  return true;
}

export async function endLostTurn(
  db: DatabaseExecutor,
  turn: TurnRow,
  interruption: TurnInterruption,
  now: Date,
): Promise<RecoveryDecision> {
  if (neverStarted(turn)) {
    await requeueTurn(db, turn, now, now);
    return { action: "requeued" };
  }
  const stopped = turn.status === "stopping" && turn.interruption === "stop";
  const action = stopped ? "cancelled" : "interrupted";
  const input: FinishTurnInput = {
    status: action,
    interruption: turn.status === "stopping" ? turn.interruption : interruption,
  };
  const note = interruptionNote(input.interruption ?? null);
  if (action === "interrupted" && note && !turn.handoff) input.resume = note;
  const result = await finishTurn(db, turn, input, null, now);
  if (result?.status === "needs_attention")
    return { action: "needs_attention", reason: "uncertain_input" };
  return { action };
}

export async function recoverTurn(
  db: DatabaseExecutor,
  turn: TurnRow,
  evidence: { unfinishedTool: boolean },
  deviceId: string,
  now: Date,
): Promise<RecoveryDecision> {
  if (neverStarted(turn)) {
    await requeueTurn(db, turn, now, now);
    return { action: "requeued" };
  }
  if (turn.status === "stopping" || turn.handoff) {
    const action =
      turn.status === "stopping" && turn.interruption === "stop" ? "cancelled" : "interrupted";
    const input: FinishTurnInput = { status: action };
    const note = interruptionNote(turn.interruption);
    if (action === "interrupted" && note && !turn.handoff) input.resume = note;
    const result = await finishTurn(db, turn, input, deviceId, now);
    if (result?.status === "needs_attention")
      return { action: "needs_attention", reason: "uncertain_input" };
    return { action };
  }
  const unconfirmed = await db
    .select({ id: agentWorkItems.id })
    .from(agentWorkItems)
    .where(
      and(
        eq(agentWorkItems.turnId, turn.id),
        or(
          and(eq(agentWorkItems.status, "submitted"), eq(agentWorkItems.steered, true)),
          eq(agentWorkItems.status, "uncertain"),
        ),
      ),
    );
  let reason: TurnAttentionReason | null = null;
  if (turn.recoveries > 0 || !turn.autoContinue) reason = "interrupted_again";
  else if (evidence.unfinishedTool) reason = "unfinished_tool";
  else if (unconfirmed.length) reason = "uncertain_input";
  await setItemStatus(
    db,
    unconfirmed.map((item) => item.id),
    "interrupt",
    { reason: "interrupted" },
  );
  if (reason) {
    const changed = await db
      .update(agentTurns)
      .set({
        status: turnMachine.events.needAttention.to,
        attentionReason: reason,
        interruption: "app",
        ...noLease,
      })
      .where(
        and(
          eq(agentTurns.id, turn.id),
          inStates(agentTurns.status, turnMachine.from("needAttention")),
        ),
      )
      .returning({ id: agentTurns.id });
    if (changed.length) {
      await setSessionStatus(db, turn.sessionId, "rest", now);
      await settleHelper(db, turn, "needs_attention", now);
    }
    return { action: "needs_attention", reason };
  }
  await db
    .update(agentTurns)
    .set({
      status: turnMachine.events.continue.to,
      attempt: turn.attempt + 1,
      generation: turn.generation + 1,
      recoveries: turn.recoveries + 1,
      interruption: "app",
      leaseExpiresAt: leaseUntil(now),
    })
    .where(
      and(
        eq(agentTurns.id, turn.id),
        eq(agentTurns.attempt, turn.attempt),
        inStates(agentTurns.status, turnMachine.from("continue")),
      ),
    );
  return { action: "continue" };
}
