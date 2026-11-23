import {
  liveTurnStatuses,
  sessionMachine,
  turnMachine,
  type TurnAttentionReason,
  type TurnOutcome,
  type TurnStatus,
} from "@substrate/contracts/agent-work";
import type { Usage } from "@substrate/contracts/harness";

import type { LocalTransaction } from "../../database.ts";
import { inbox, sessions, turns, type TurnInterruption } from "../../schema/index.ts";
import { enqueue } from "../enqueue.ts";
import { appendEvents } from "../events.ts";
import { claimableStatuses, localDedupeKeys, setItemStatus } from "../inbox.ts";
import { inStates } from "../machine-sql.ts";
import { rotateEpoch, sessionById, type SessionRow } from "../sessions.ts";
import type { TurnRow } from "./claim.ts";
import { and, eq, inArray } from "drizzle-orm";

const liveStatuses = [...liveTurnStatuses];
export interface FinishTurnInput {
  status: Extract<
    TurnStatus,
    "completed" | "cancelled" | "interrupted" | "needs_attention" | "failed"
  >;
  outcome?: TurnOutcome | null;
  error?: string | null;
  attentionReason?: TurnAttentionReason | null;
  /** Inputs the harness reported as read. */
  consumedInputIds?: string[];
  /** Steered inputs that an interrupt receipt reported as still queued. */
  stillQueuedInputIds?: string[];
  usage?: Usage | null;
  /** Queues a recovery item so that the next turn of the session continues this turn's work. */
  resume?: string;
}

// The turn machine event that ends a live turn with each status.
const finishEvents = {
  completed: "complete",
  cancelled: "cancel",
  interrupted: "interrupt",
  needs_attention: "needAttention",
  failed: "fail",
} as const satisfies Record<FinishTurnInput["status"], keyof typeof turnMachine.events>;

/** A system item that resumes an ended turn's work in the next turn of its session. */
async function queueResume(tx: LocalTransaction, turn: TurnRow, body: string, now: number) {
  await enqueue(
    tx,
    {
      sessionId: turn.sessionId,
      userAgentId: turn.userAgentId,
      source: "recovery",
      sourceRef: { source: "recovery", turnId: turn.id },
      dedupeKey: localDedupeKeys.recovery(turn.id, turn.attempt),
      body,
    },
    now,
  );
}

const ownerInterruptedNote =
  "Your owner interrupted the previous turn so that newer messages run first. Continue its work if it still matters.";
const organizationSwitchNote =
  "The desktop switched to another organization while this turn ran. Continue its work if it still matters.";

/** The resume note of a turn that the owner or the runtime interrupted, if its work resumes. */
export function interruptionNote(interruption: TurnInterruption | null) {
  if (interruption === "owner") return ownerInterruptedNote;
  if (interruption === "retire") return organizationSwitchNote;
  return null;
}

/**
 * Ends a live turn and settles its items. Batch items are consumed unless the turn needs
 * attention. Steered items are consumed with evidence, requeued to the front of their lane
 * when a receipt says they were still queued, and uncertain otherwise: they are never resent,
 * and the turn needs the owner until each is resent or discarded. A handoff turn starts the
 * session's next epoch once, whatever its end.
 */
export async function finishTurn(
  tx: LocalTransaction,
  turnId: string,
  input: FinishTurnInput,
  now: number,
) {
  const turn = await tx.select().from(turns).where(eq(turns.id, turnId)).get();
  if (!turn || !liveStatuses.includes(turn.status)) return undefined;
  const items = await tx
    .select()
    .from(inbox)
    .where(and(eq(inbox.turnId, turnId), eq(inbox.status, "submitted")))
    .all();
  const consumed = new Set(input.consumedInputIds ?? []);
  const queued = new Set(input.stillQueuedInputIds ?? []);
  const keep = input.status === "needs_attention";
  const settle = {
    consumed: new Array<string>(),
    requeued: new Array<string>(),
    uncertain: new Array<string>(),
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
  await setItemStatus(tx, settle.consumed, "consume");
  const passive = await tx
    .select({ id: inbox.id })
    .from(inbox)
    .where(
      and(
        eq(inbox.turnId, turnId),
        eq(inbox.source, "thread_context"),
        inArray(inbox.status, claimableStatuses),
      ),
    )
    .all();
  await setItemStatus(tx, [...passive.map((item) => item.id), ...passiveQueued], "drop", {
    reason: "turn_finished",
  });
  await setItemStatus(tx, settle.requeued, "requeue", { steered: false, turnId: null });
  await setItemStatus(tx, settle.uncertain, "unconfirm", { reason: "no_consumption_evidence" });
  const uncertain = Boolean(settle.uncertain.length) && input.status !== "needs_attention";
  const event = uncertain ? "needAttention" : finishEvents[input.status];
  const status = turnMachine.events[event].to;
  await tx
    .update(turns)
    .set({
      status,
      outcome: input.outcome ?? null,
      error: input.error ?? null,
      attentionReason: uncertain ? "uncertain_input" : (input.attentionReason ?? null),
      finishedAt: now,
      usage: input.usage ?? turn.usage,
    })
    .where(and(eq(turns.id, turnId), inStates(turns.status, turnMachine.from(event))));
  await appendEvents(
    tx,
    turnId,
    [{ kind: "turn_finished", data: { status, outcome: input.outcome ?? null } }],
    now,
  );
  if (input.resume) await queueResume(tx, turn, input.resume, now);
  const session = await sessionById(tx, turn.sessionId);
  if (session) {
    // A closed session stays closed; it still counts the turn.
    const rests = sessionMachine.canFire(session.status, "rest");
    const changes: Partial<SessionRow> = {
      epochTurns: session.epochTurns + (status === "completed" ? 1 : 0),
      updatedAt: now,
    };
    if (rests) changes.status = sessionMachine.events.rest.to;
    await tx
      .update(sessions)
      .set(changes)
      .where(
        and(
          eq(sessions.id, session.id),
          rests ? inStates(sessions.status, sessionMachine.from("rest")) : undefined,
        ),
      );
    // A retried handoff turn ends again; the epoch it handed off already rotated.
    if (turn.handoff && session.epoch === turn.epoch) await rotateEpoch(tx, session.id, now);
  }
  return { turn: { ...turn, status }, ...settle };
}
