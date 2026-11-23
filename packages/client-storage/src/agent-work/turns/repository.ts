import {
  inboxItemMachine,
  liveTurnStatuses,
  turnMachine,
  type TurnAttentionReason,
  type TurnSourceMessage,
} from "@substrate/contracts/agent-work";

import type { LocalTransaction, RunTransaction } from "../../database.ts";
import { inbox, turnEvents, turns, type TurnInterruption } from "../../schema/index.ts";
import { appendEvents, type NewTurnEvent } from "../events.ts";
import { setItemStatus } from "../inbox.ts";
import { inStates } from "../machine-sql.ts";
import { rotateEpoch, setSessionStatus } from "../sessions.ts";
import { settleUncertainTurn } from "../uncertain.ts";
import { claimTurns, type ClaimOptions, type TurnRow } from "./claim.ts";
import { finishTurn, type FinishTurnInput } from "./finish.ts";
import { recoverTurn, recoverTurns, requeueTurn } from "./recovery.ts";
import { and, desc, eq, inArray, lt } from "drizzle-orm";

const liveStatuses = [...liveTurnStatuses];
async function retryTurn(tx: LocalTransaction, turn: TurnRow, now: number, epoch?: number) {
  const values: Partial<typeof turns.$inferInsert> = {
    status: turnMachine.events.retry.to,
    attempt: turn.attempt + 1,
    generation: turn.generation + 1,
    attentionReason: null,
    error: null,
    finishedAt: null,
  };
  if (epoch !== undefined) values.epoch = epoch;
  await tx
    .update(turns)
    .set(values)
    .where(and(eq(turns.id, turn.id), inStates(turns.status, turnMachine.from("retry"))));
  await setSessionStatus(tx, turn.sessionId, "work", now);
}

async function folderBusy(tx: LocalTransaction, folder: string, except?: string) {
  const live = await tx
    .select({ id: turns.id })
    .from(turns)
    .where(and(eq(turns.folderKey, folder), inArray(turns.status, liveStatuses)))
    .all();
  return live.some((turn) => turn.id !== except);
}

async function attentionTurn(tx: LocalTransaction, turnId: string) {
  const turn = await tx.select().from(turns).where(eq(turns.id, turnId)).get();
  if (!turn || turn.status !== "needs_attention") throw new Error("This work does not need you.");
  return turn;
}

export function turnRepository(run: RunTransaction) {
  return {
    claim: (now: number, options: ClaimOptions) => run((tx) => claimTurns(tx, now, options)),
    get: (id: string) => run((tx) => tx.select().from(turns).where(eq(turns.id, id)).get()),
    /** Turns waiting for a worker, such as continues and retries. */
    assigned: (organizationId: string) =>
      run((tx) =>
        tx
          .select()
          .from(turns)
          .where(and(eq(turns.status, "assigned"), eq(turns.organizationId, organizationId)))
          .all(),
      ),
    /** Only the IDs: callers count and list these turns, and the full rows hold the envelope. */
    needsAttention: (organizationId: string) =>
      run((tx) =>
        tx
          .select({ id: turns.id, userAgentId: turns.userAgentId })
          .from(turns)
          .where(and(eq(turns.status, "needs_attention"), eq(turns.organizationId, organizationId)))
          .all(),
      ),
    forSessions: (sessionIds: string[], options: { before?: number; limit?: number } = {}) =>
      run(async (tx) =>
        sessionIds.length
          ? tx
              .select()
              .from(turns)
              .where(
                and(
                  inArray(turns.sessionId, sessionIds),
                  options.before === undefined ? undefined : lt(turns.createdAt, options.before),
                ),
              )
              .orderBy(desc(turns.createdAt))
              .limit(options.limit ?? 50)
              .all()
          : [],
      ),
    /** Records the rendered input before the turn command. */
    prepared: (
      id: string,
      input: { envelope: string; prefixHash: string; sourceMessages: TurnSourceMessage[] },
    ) => run((tx) => tx.update(turns).set(input).where(eq(turns.id, id))),
    /** The turn runs. The events for it land in the same transaction. */
    running: (id: string, now: number, events: NewTurnEvent[] = []) =>
      run(async (tx) => {
        await tx
          .update(turns)
          .set({ status: turnMachine.events.run.to, startedAt: now })
          .where(and(eq(turns.id, id), inStates(turns.status, turnMachine.from("run"))));
        await appendEvents(tx, id, events, now);
      }),
    /** The turn waits for the owner. The events for it land in the same transaction. */
    waiting: (id: string, now: number, events: NewTurnEvent[] = []) =>
      run(async (tx) => {
        await tx
          .update(turns)
          .set({ status: turnMachine.events.wait.to })
          .where(and(eq(turns.id, id), inStates(turns.status, turnMachine.from("wait"))));
        await appendEvents(tx, id, events, now);
      }),
    /** The owner or the runtime asked the live turn to end. */
    stopping: (id: string, interruption: TurnInterruption) =>
      run(async (tx) => {
        const turn = await tx.select().from(turns).where(eq(turns.id, id)).get();
        if (!turn || !liveStatuses.includes(turn.status)) return undefined;
        const status = turnMachine.events.stop.to;
        await tx
          .update(turns)
          .set({ status, interruption })
          .where(and(eq(turns.id, id), inStates(turns.status, turnMachine.from("stop"))));
        return { ...turn, status, interruption };
      }),
    /** The turn was told to wrap up, so it never continues by itself. */
    wrapUp: (id: string) =>
      run((tx) => tx.update(turns).set({ autoContinue: false }).where(eq(turns.id, id))),
    finish: (id: string, input: FinishTurnInput, now: number) =>
      run((tx) => finishTurn(tx, id, input, now)),
    /** Removes a claimed turn whose items were all dropped before it started. */
    discard: (id: string, now: number) =>
      run(async (tx) => {
        const turn = await tx.select().from(turns).where(eq(turns.id, id)).get();
        if (turn?.status !== "assigned") return;
        await tx.delete(turnEvents).where(eq(turnEvents.turnId, id));
        await tx.delete(turns).where(eq(turns.id, id));
        await setSessionStatus(tx, turn.sessionId, "rest", now);
      }),
    /** Recovers the organization's live turns. Other organizations wait for their own runtime. */
    recover: (now: number, organizationId: string) =>
      run((tx) => recoverTurns(tx, now, organizationId)),
    /** One live turn whose native session closed under it, such as when the worker exited. */
    recoverOne: (id: string, now: number) =>
      run(async (tx) => {
        const turn = await tx.select().from(turns).where(eq(turns.id, id)).get();
        if (!turn || !liveStatuses.includes(turn.status)) return undefined;
        return recoverTurn(tx, turn, now, "The agent's session closed while this turn ran.");
      }),
    /**
     * The turn could not start for a passing reason, such as an outage. A turn that never ran
     * puts its items back, available again at availableAt, and is removed. A turn that already
     * ran stays assigned, and the runtime retries it later.
     */
    requeue: (id: string, availableAt: number, now: number) =>
      run(async (tx) => {
        const turn = await tx.select().from(turns).where(eq(turns.id, id)).get();
        if (turn?.status !== "assigned") return undefined;
        if (turn.attempt > 1 || turn.startedAt !== null || turn.eventCount > 0)
          return "kept" as const;
        await requeueTurn(tx, turn, availableAt, now);
        return "requeued" as const;
      }),
    /**
     * Runs a needs-attention turn again as its next attempt. A turn that needs the owner only
     * for uncertain input sends those items again instead.
     */
    retry: (id: string, now: number) =>
      run(async (tx) => {
        const turn = await attentionTurn(tx, id);
        const kept = await tx
          .select({ id: inbox.id })
          .from(inbox)
          .where(and(eq(inbox.turnId, id), eq(inbox.status, "submitted"), eq(inbox.steered, false)))
          .all();
        if (turn.attentionReason === "uncertain_input" && !kept.length) {
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
            .where(
              and(eq(inbox.turnId, id), inStates(inbox.status, inboxItemMachine.from("resend"))),
            );
          await settleUncertainTurn(tx, id, now);
          return;
        }
        if (await folderBusy(tx, turn.folderKey, id))
          throw new Error("The agent is busy. Try again when it finishes.");
        await retryTurn(tx, turn, now);
      }),
    /** Ends a needs-attention turn without running it again. */
    dismiss: (id: string, now: number) =>
      run(async (tx) => {
        const turn = await attentionTurn(tx, id);
        const items = await tx
          .select({ id: inbox.id })
          .from(inbox)
          .where(and(eq(inbox.turnId, id), inArray(inbox.status, ["submitted", "uncertain"])))
          .all();
        await setItemStatus(
          tx,
          items.map((item) => item.id),
          "dismiss",
          { reason: "dismissed" },
        );
        const status = turnMachine.events.dismiss.to;
        await tx
          .update(turns)
          .set({ status, finishedAt: now })
          .where(and(eq(turns.id, turn.id), inStates(turns.status, turnMachine.from("dismiss"))));
        await appendEvents(
          tx,
          id,
          [{ kind: "turn_finished", data: { status, outcome: null } }],
          now,
        );
      }),
    /** Runs a needs-attention turn again in a new epoch, without the old native session. */
    startFresh: (id: string, now: number) =>
      run(async (tx) => {
        const turn = await attentionTurn(tx, id);
        if (await folderBusy(tx, turn.folderKey, id))
          throw new Error("The agent is busy. Try again when it finishes.");
        const epoch = await rotateEpoch(tx, turn.sessionId, now);
        await retryTurn(tx, turn, now, epoch);
      }),
    /** Marks the live turn of a failed open as needing the owner. */
    attention: (id: string, reason: TurnAttentionReason, error: string | null, now: number) =>
      run((tx) =>
        finishTurn(tx, id, { status: "needs_attention", attentionReason: reason, error }, now),
      ),
  };
}
