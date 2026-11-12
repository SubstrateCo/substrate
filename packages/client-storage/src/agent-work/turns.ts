import {
  inboxItemMachine,
  inboxLaneAgingMs,
  inboxLanes,
  liveTurnStatuses,
  sessionMachine,
  turnMachine,
  triggerRegistry,
  type TurnAttentionReason,
  type TurnOutcome,
  type TurnSourceMessage,
  type TurnStatus,
} from "@substrate/contracts/agent-work";
import type { Usage } from "@substrate/contracts/harness";

import type { LocalTransaction, RunTransaction } from "../database.ts";
import { inbox, sessions, turnEvents, turns, type TurnInterruption } from "../schema/index.ts";
import { enqueue } from "./enqueue.ts";
import { appendEvents, type NewTurnEvent } from "./events.ts";
import { claimableStatuses, localDedupeKeys, setItemStatus, type InboxRow } from "./inbox.ts";
import { inStates } from "./machine-sql.ts";
import {
  folderKey,
  rotateEpoch,
  sessionById,
  setSessionStatus,
  type SessionRow,
} from "./sessions.ts";
import { settleUncertainTurn } from "./uncertain.ts";
import { and, desc, eq, inArray, lt, lte, ne, or } from "drizzle-orm";

export type TurnRow = typeof turns.$inferSelect;

/** Live turns on one device. Main slots go before helper slots. */
const deviceTurnCap = 3;
/** Items batched into one turn. */
const turnBatchLimit = 20;
const liveStatuses = [...liveTurnStatuses];

/**
 * Claims take one organization's work. The device cap counts the live turns of that
 * organization: the turns its runtime drives. Other organizations' rows wait for their runtime.
 */
export interface ClaimOptions {
  deviceCap?: number;
  batchLimit?: number;
  organizationId: string;
  /** Folders the runtime holds without a live turn, such as during native compaction. */
  busyFolders?: string[];
  /** Only these agents run here, such as the agents homed on this desktop. */
  userAgentIds?: string[];
}

export interface ClaimedTurn {
  turn: TurnRow;
  session: SessionRow;
  items: InboxRow[];
}

function effectiveLane(item: InboxRow, now: number) {
  const lane = inboxLanes.indexOf(item.lane);
  if (item.lane !== "background") return lane;
  return Math.max(0, lane - Math.floor(Math.max(0, now - item.availableAt) / inboxLaneAgingMs));
}

/** Claim order inside a lane: requeued items first, then the longest waiting. */
function itemOrder(a: InboxRow, b: InboxRow) {
  const front =
    Number(b.status === "confirmed_unconsumed") - Number(a.status === "confirmed_unconsumed");
  return front || a.availableAt - b.availableAt || a.createdAt - b.createdAt;
}

/** The pending rotation item of the session's current epoch, which runs alone. */
function rotationItem(session: SessionRow, items: InboxRow[]) {
  if (!session.rotation) return undefined;
  return items.find(
    (item) => item.sourceRef.source === "epoch" && item.sourceRef.fromEpoch === session.epoch,
  );
}

/**
 * Starts turns for free slots: one live turn per folder and at most deviceCap live turns. Each
 * slot takes the session with the best waiting item (owner, then system, then background with
 * aging; main folders before helper folders) and batches that session's available items.
 */
async function claimTurns(
  tx: LocalTransaction,
  now: number,
  options: ClaimOptions,
): Promise<ClaimedTurn[]> {
  const cap = options.deviceCap ?? deviceTurnCap;
  const limit = options.batchLimit ?? turnBatchLimit;
  const live = await tx
    .select({ folderKey: turns.folderKey, organizationId: turns.organizationId })
    .from(turns)
    .where(inArray(turns.status, liveStatuses))
    .all();
  const driven = live.filter((turn) => turn.organizationId === options.organizationId);
  let free = cap - driven.length;
  if (free <= 0 || options.userAgentIds?.length === 0) return [];
  const busy = new Set([...live.map((turn) => turn.folderKey), ...(options.busyFolders ?? [])]);
  const rows = await tx
    .select({ item: inbox, session: sessions })
    .from(inbox)
    .innerJoin(sessions, eq(sessions.id, inbox.sessionId))
    .where(
      and(
        inArray(inbox.status, claimableStatuses),
        lte(inbox.availableAt, now),
        ne(sessions.status, "closed"),
        eq(sessions.organizationId, options.organizationId),
        options.userAgentIds === undefined
          ? undefined
          : inArray(sessions.userAgentId, options.userAgentIds),
      ),
    )
    .all();
  // A session whose turn needs the owner waits until the owner resolves it.
  const blocked = new Set(
    (
      await tx
        .select({ sessionId: turns.sessionId })
        .from(turns)
        .where(
          and(
            eq(turns.status, "needs_attention"),
            eq(turns.organizationId, options.organizationId),
          ),
        )
        .all()
    ).map((row) => row.sessionId),
  );
  const groups = new Map<string, { session: SessionRow; items: InboxRow[] }>();
  for (const row of rows) {
    if (blocked.has(row.session.id)) continue;
    const group = groups.get(row.session.id) ?? { session: row.session, items: [] };
    group.items.push(row.item);
    groups.set(row.session.id, group);
  }
  const ranked = [...groups.values()].map((group) => {
    group.items.sort(itemOrder);
    // The first of equal items wins, as the items are in claim order.
    const best = group.items.reduce((a, b) =>
      (effectiveLane(a, now) - effectiveLane(b, now) || itemOrder(a, b)) <= 0 ? a : b,
    );
    return {
      ...group,
      best,
      lane: effectiveLane(best, now),
      helper: group.session.kind === "helper",
    };
  });
  ranked.sort(
    (a, b) => a.lane - b.lane || Number(a.helper) - Number(b.helper) || itemOrder(a.best, b.best),
  );
  const claimed: ClaimedTurn[] = [];
  for (const group of ranked) {
    if (free <= 0) break;
    const folder = folderKey(group.session);
    if (busy.has(folder)) continue;
    const rotation = rotationItem(group.session, group.items);
    const batch = rotation
      ? [rotation]
      : group.items
          .filter((item) => item.sourceRef.source !== "epoch" || !group.session.rotation)
          .slice(0, limit);
    if (!batch.length) continue;
    const interactive =
      group.session.kind !== "helper" &&
      !rotation &&
      batch.some((item) => triggerRegistry[item.source].turnMode === "interactive");
    const recovery = batch.find((item) => item.sourceRef.source === "recovery");
    const turn: TurnRow = {
      id: crypto.randomUUID(),
      sessionId: group.session.id,
      userAgentId: group.session.userAgentId,
      organizationId: group.session.organizationId,
      folderKey: folder,
      kind: interactive ? "interactive" : "unattended",
      status: "assigned",
      outcome: null,
      attempt: 1,
      generation: 1,
      epoch: group.session.epoch,
      handoff: Boolean(rotation),
      envelope: null,
      prefixHash: null,
      usage: null,
      eventCount: 0,
      activity: null,
      error: null,
      attentionReason: null,
      interruption: null,
      recoveries: 0,
      autoContinue: true,
      resumesTurnId: recovery?.sourceRef.source === "recovery" ? recovery.sourceRef.turnId : null,
      sourceMessages: [],
      requestAnchors: batch.flatMap((item) =>
        item.sourceRef.source === "answer" || item.sourceRef.source === "approval_result"
          ? [
              {
                requestId: item.sourceRef.requestId,
                anchorMessageId: item.sourceRef.anchorMessageId,
              },
            ]
          : [],
      ),
      createdAt: now,
      startedAt: null,
      finishedAt: null,
    };
    await tx.insert(turns).values(turn);
    await setItemStatus(
      tx,
      batch.map((item) => item.id),
      "submit",
      { turnId: turn.id, held: false },
    );
    await setSessionStatus(tx, group.session.id, "work", now);
    busy.add(folder);
    free--;
    claimed.push({
      turn,
      session: group.session,
      items: batch.map((item) => ({
        ...item,
        status: inboxItemMachine.events.submit.to,
        turnId: turn.id,
        held: false,
      })),
    });
  }
  return claimed;
}

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
async function finishTurn(
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
  for (const item of items) {
    if (!item.steered) {
      if (!keep) settle.consumed.push(item.id);
    } else if (consumed.has(item.id)) settle.consumed.push(item.id);
    else if (queued.has(item.id)) settle.requeued.push(item.id);
    else settle.uncertain.push(item.id);
  }
  await setItemStatus(tx, settle.consumed, "consume");
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

export type RecoveryDecision =
  | { turnId: string; action: "continue" }
  | { turnId: string; action: "needs_attention"; reason: TurnAttentionReason }
  | { turnId: string; action: "requeued" }
  | { turnId: string; action: "cancelled" | "interrupted" };

/** Puts the batch of a turn that never started back in the inbox and removes the turn. */
async function requeueTurn(tx: LocalTransaction, turn: TurnRow, availableAt: number, now: number) {
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
async function recoverTurn(
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
async function recoverTurns(tx: LocalTransaction, now: number, organizationId: string) {
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
        await tx
          .update(turns)
          .set({
            status: turnMachine.events.retry.to,
            attempt: turn.attempt + 1,
            generation: turn.generation + 1,
            attentionReason: null,
            error: null,
            finishedAt: null,
          })
          .where(and(eq(turns.id, id), inStates(turns.status, turnMachine.from("retry"))));
        await setSessionStatus(tx, turn.sessionId, "work", now);
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
        await tx
          .update(turns)
          .set({
            status: turnMachine.events.retry.to,
            attempt: turn.attempt + 1,
            generation: turn.generation + 1,
            epoch,
            attentionReason: null,
            error: null,
            finishedAt: null,
          })
          .where(and(eq(turns.id, id), inStates(turns.status, turnMachine.from("retry"))));
        await setSessionStatus(tx, turn.sessionId, "work", now);
      }),
    /** Marks the live turn of a failed open as needing the owner. */
    attention: (id: string, reason: TurnAttentionReason, error: string | null, now: number) =>
      run((tx) =>
        finishTurn(tx, id, { status: "needs_attention", attentionReason: reason, error }, now),
      ),
  };
}
