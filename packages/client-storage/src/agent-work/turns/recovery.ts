import {
  inboxItemMachine,
  liveTurnStatuses,
  turnMachine,
  type TurnAttentionReason,
} from "@substrate/contracts/agent-work";

import type { LocalTransaction } from "../../database.ts";
import { inbox, turnEvents, turns } from "../../schema/index.ts";
import { appendEvents } from "../events.ts";
import { setItemStatus } from "../inbox.ts";
import { inStates } from "../machine-sql.ts";
import { setSessionStatus } from "../sessions.ts";
import type { TurnRow } from "./claim.ts";
import { finishTurn, interruptionNote, type FinishTurnInput } from "./finish.ts";
import { and, eq, inArray, or } from "drizzle-orm";

const liveStatuses = [...liveTurnStatuses];
export type RecoveryDecision =
  | { turnId: string; action: "continue" }
  | { turnId: string; action: "needs_attention"; reason: TurnAttentionReason }
  | { turnId: string; action: "requeued" }
  | { turnId: string; action: "cancelled" | "interrupted" };

/** Puts the batch of a turn that never started back in the inbox and removes the turn. */
export async function requeueTurn(
  tx: LocalTransaction,
  turn: TurnRow,
  availableAt: number,
  now: number,
) {
  await tx
    .update(inbox)
    .set({
      status: inboxItemMachine.events.unclaim.to,
      turnId: null,
      availableAt,
      deadlineAt: availableAt,
    })
    .where(
      and(
        eq(inbox.turnId, turn.id),
        inStates(inbox.status, inboxItemMachine.from("unclaim")),
        eq(inbox.steered, false),
      ),
    );
  await tx.delete(turnEvents).where(eq(turnEvents.turnId, turn.id));
  await tx.delete(turns).where(eq(turns.id, turn.id));
  await setSessionStatus(tx, turn.sessionId, "rest", now);
}

/**
 * A live turn whose harness process died. A stopped turn is cancelled, and a turn the owner
 * interrupted with Send now ends as interrupted while its held items run next; neither continues
 * by itself. A handoff turn ends, which rotates its epoch. Otherwise the turn continues once, as
 * the same turn with the next attempt and generation, only when every tool call it started also
 * finished and none of its steered input is unconfirmed; else it needs the owner. A turn that
 * never started puts its items back.
 */
export async function recoverTurn(
  tx: LocalTransaction,
  turn: TurnRow,
  now: number,
  note: string,
): Promise<RecoveryDecision> {
  if (turn.status === "assigned" && turn.startedAt === null && turn.attempt === 1) {
    await requeueTurn(tx, turn, now, now);
    return { turnId: turn.id, action: "requeued" };
  }
  if (turn.status === "stopping" || turn.handoff) {
    const action =
      turn.status === "stopping" && turn.interruption === "stop" ? "cancelled" : "interrupted";
    const input: FinishTurnInput = { status: action };
    const note = interruptionNote(turn.interruption);
    if (action === "interrupted" && note && !turn.handoff) input.resume = note;
    await finishTurn(tx, turn.id, input, now);
    return { turnId: turn.id, action };
  }
  const events = await tx
    .select({ kind: turnEvents.kind, itemId: turnEvents.itemId })
    .from(turnEvents)
    .where(and(eq(turnEvents.turnId, turn.id), eq(turnEvents.attempt, turn.attempt)))
    .all();
  const started = new Set(events.filter((e) => e.kind === "tool_started").map((e) => e.itemId));
  for (const event of events) if (event.kind === "tool_completed") started.delete(event.itemId);
  const unconfirmed = await tx
    .select({ id: inbox.id })
    .from(inbox)
    .where(
      and(
        eq(inbox.turnId, turn.id),
        or(
          and(eq(inbox.status, "submitted"), eq(inbox.steered, true)),
          eq(inbox.status, "uncertain"),
        ),
      ),
    )
    .all();
  let reason: TurnAttentionReason | null = null;
  if (turn.recoveries > 0 || !turn.autoContinue) reason = "interrupted_again";
  else if (started.size) reason = "unfinished_tool";
  else if (unconfirmed.length) reason = "uncertain_input";
  await setItemStatus(
    tx,
    unconfirmed.map((item) => item.id),
    "interrupt",
    { reason: "interrupted" },
  );
  if (reason) {
    await tx
      .update(turns)
      .set({
        status: turnMachine.events.needAttention.to,
        attentionReason: reason,
        interruption: "app",
      })
      .where(and(eq(turns.id, turn.id), inStates(turns.status, turnMachine.from("needAttention"))));
    await appendEvents(tx, turn.id, [{ kind: "note", data: { text: note } }], now);
    await setSessionStatus(tx, turn.sessionId, "rest", now);
    return { turnId: turn.id, action: "needs_attention", reason };
  }
  await tx
    .update(turns)
    .set({
      status: turnMachine.events.continue.to,
      attempt: turn.attempt + 1,
      generation: turn.generation + 1,
      recoveries: turn.recoveries + 1,
      interruption: "app",
    })
    .where(and(eq(turns.id, turn.id), inStates(turns.status, turnMachine.from("continue"))));
  await appendEvents(
    tx,
    turn.id,
    [{ kind: "note", data: { text: "Resumed after interruption." } }],
    now,
  );
  return { turnId: turn.id, action: "continue" };
}

/** After an app start, every live turn of the organization died with the harness process. */
export async function recoverTurns(tx: LocalTransaction, now: number, organizationId: string) {
  const live = await tx
    .select()
    .from(turns)
    .where(and(inArray(turns.status, liveStatuses), eq(turns.organizationId, organizationId)))
    .all();
  const decisions: RecoveryDecision[] = [];
  for (const turn of live)
    decisions.push(await recoverTurn(tx, turn, now, "The app closed while this turn ran."));
  return decisions;
}
