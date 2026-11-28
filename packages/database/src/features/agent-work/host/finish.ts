import {
  turnMachine,
  type TurnAttentionReason,
  type TurnInterruption,
  type TurnOutcome,
  type TurnStatus,
} from "@substrate/contracts/agent-work";
import type { Usage } from "@substrate/contracts/harness-runtime";

import type { DatabaseExecutor } from "../../../core/executor";
import { admit } from "../admission/admission";
import { finishHelper, helperBySession } from "../helpers";
import { claimableStatuses, openStatuses, setItemStatus } from "../items";
import { inStates } from "../machine-sql";
import { setSessionStatus } from "../sessions";
import { agentSessions } from "../sessions.schema";
import { agentTurns } from "../turns.schema";
import { agentWorkItems } from "../work-items.schema";
import { liveStatuses, type TurnRow } from "./held-turn";
import { and, eq, inArray } from "drizzle-orm";

export interface FinishTurnInput {
  status: Extract<
    TurnStatus,
    "completed" | "cancelled" | "interrupted" | "needs_attention" | "failed"
  >;
  outcome?: TurnOutcome | null;
  error?: string | null;
  attentionReason?: TurnAttentionReason | null;
  interruption?: TurnInterruption | null;
  consumedItemIds?: string[];
  stillQueuedItemIds?: string[];
  usage?: Usage | null;
  resume?: string;
}

const finishEvents = {
  completed: "complete",
  cancelled: "cancel",
  interrupted: "interrupt",
  needs_attention: "needAttention",
  failed: "fail",
} as const satisfies Record<FinishTurnInput["status"], keyof typeof turnMachine.events>;

export const noLease = { leaseDeviceId: null, leaseExpiresAt: null };

export async function settleHelper(
  db: DatabaseExecutor,
  turn: Pick<TurnRow, "sessionId">,
  status: TurnStatus,
  now: Date,
) {
  const helper = await helperBySession(db, turn.sessionId);
  if (helper?.status !== "running") return;
  if (status === "completed" || status === "interrupted") {
    const queued = await db
      .select({ id: agentWorkItems.id })
      .from(agentWorkItems)
      .where(
        and(
          eq(agentWorkItems.sessionId, turn.sessionId),
          inArray(agentWorkItems.status, openStatuses),
        ),
      )
      .limit(1);
    if (queued.length) return;
  }
  await finishHelper(db, helper, null, now);
}

export async function finishTurn(
  db: DatabaseExecutor,
  turn: TurnRow,
  input: FinishTurnInput,
  deviceId: string | null,
  now: Date,
) {
  if (!liveStatuses.includes(turn.status)) return undefined;
  const items = await db
    .select()
    .from(agentWorkItems)
    .where(and(eq(agentWorkItems.turnId, turn.id), eq(agentWorkItems.status, "submitted")));
  const consumed = new Set(input.consumedItemIds ?? []);
  const queued = new Set(input.stillQueuedItemIds ?? []);
  const keep = input.status === "needs_attention";
  const settle: Record<"consumed" | "requeued" | "uncertain", string[]> = {
    consumed: [],
    requeued: [],
    uncertain: [],
  };
  const passiveQueued: string[] = [];
  for (const item of items) {
    if (!item.steered) {
      if (!keep) settle.consumed.push(item.id);
    } else if (consumed.has(item.id)) settle.consumed.push(item.id);
    else if (queued.has(item.id)) {
      if (item.source === "thread_context") passiveQueued.push(item.id);
      else settle.requeued.push(item.id);
    } else settle.uncertain.push(item.id);
  }
  const event = settle.uncertain.length && !keep ? "needAttention" : finishEvents[input.status];
  const status = turnMachine.events[event].to;
  const ended = await db
    .update(agentTurns)
    .set({
      status,
      outcome: input.outcome ?? null,
      error: input.error ?? null,
      attentionReason:
        event === "needAttention" && !keep ? "uncertain_input" : (input.attentionReason ?? null),
      interruption: input.interruption ?? turn.interruption,
      usage: input.usage ?? turn.usage,
      finishedAt: now,
      ...noLease,
    })
    .where(and(eq(agentTurns.id, turn.id), inStates(agentTurns.status, turnMachine.from(event))))
    .returning({ id: agentTurns.id });
  if (!ended.length) return undefined;
  await setItemStatus(db, settle.consumed, "consume");
  const passive = await db
    .select({ id: agentWorkItems.id })
    .from(agentWorkItems)
    .where(
      and(
        eq(agentWorkItems.turnId, turn.id),
        eq(agentWorkItems.source, "thread_context"),
        inArray(agentWorkItems.status, claimableStatuses),
      ),
    );
  await setItemStatus(db, [...passive.map((item) => item.id), ...passiveQueued], "drop", {
    reason: "turn_finished",
  });
  await setItemStatus(db, settle.requeued, "requeue", { steered: false, turnId: null });
  await setItemStatus(db, settle.uncertain, "unconfirm", { reason: "no_consumption_evidence" });
  if (input.resume) {
    const [session] = await db
      .select()
      .from(agentSessions)
      .where(eq(agentSessions.id, turn.sessionId));
    if (session)
      await admit(
        db,
        [
          {
            type: "host",
            source: "recovery",
            deviceId,
            session,
            turn: { id: turn.id, attempt: turn.attempt },
            body: input.resume,
          },
        ],
        now,
      );
  }
  await setSessionStatus(db, turn.sessionId, "rest", now);
  await settleHelper(db, turn, status, now);
  return { status, ...settle };
}
