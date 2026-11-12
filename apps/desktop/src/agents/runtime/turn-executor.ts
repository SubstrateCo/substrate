import {
  folderOf,
  interruptionNote,
  type FinishTurnInput,
  type InboxRow,
  type SessionRow,
  type TurnInterruption,
  type TurnRow,
} from "@substrate/client-storage/agent-work";
import {
  liveTurnStatuses,
  type EnvelopeResumeNote,
  type TurnStatus,
} from "@substrate/contracts/agent-work";
import type { AgentWorkChange } from "@substrate/contracts/agent-work/desktop";
import {
  harnessCodesWithClassification,
  managedPrefix,
  POLICY_VERSION,
  type HarnessCommand,
  type HarnessEvent,
  type TurnContext,
  type TurnResult,
} from "@substrate/contracts/harness";

import { envelopeItem, renderEnvelope, sortItems } from "../turns/envelope.ts";
import { turnOutcome } from "../turns/outcome.ts";
import type { LiveTurn, RuntimeContext } from "./context.ts";
import type { Epochs } from "./epochs.ts";
import type { RequestBridge } from "./requests.ts";
import { inaccessibleItems, sourceRequest } from "./source-check.ts";
import { createHash } from "node:crypto";
import { z } from "zod";

/* oxlint-disable deslop/no-unknown-parameters -- Harness errors cross the worker boundary untyped; errorCode reads their fixed code. */

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/**
 * Harness failures that pass: the worker or the connection is gone for now, a command timed
 * out, the session closes after its live turn (session-closing), or the worker does not have the
 * organization's configuration yet (it lives in memory and arrives with synchronize). Work
 * waits and runs again.
 */
const transientHarnessCodes = harnessCodesWithClassification("transient");
/** Requeued work waits this long first, doubling up to the maximum. */
const outageBackoffMs = 5_000;
export const outageBackoffMaxMs = 5 * 60_000;
/**
 * A failure without a known outage code, such as an unexpected response, is retried this many
 * times or for this long. Then the turn needs the owner. Known outages wait without a limit.
 */
const unknownFailureRetries = 6;
const unknownFailureWindowMs = 30 * 60_000;

const codedError = z.object({ code: z.string() });

/** The fixed code of a harness or server error, if it has one. */
export function errorCode(error: unknown) {
  return codedError.safeParse(error).data?.code;
}

/**
 * A known outage: the harness, the worker or the network is gone for now. fetch rejects with
 * a TypeError when the network fails; the controller uses a code when it cannot verify the
 * session.
 */
function outage(error: unknown) {
  const code = errorCode(error);
  if (code !== undefined) return transientHarnessCodes.has(code);
  return error instanceof TypeError;
}

/** A failure that is worth retrying later: an outage, or a failure without any code. */
function transient(error: unknown) {
  return errorCode(error) === undefined || outage(error);
}

/** Items rendered into the turn's first input. Steered items were delivered on their own. */
function batchItems(items: InboxRow[]) {
  return items.filter(
    (item) => !item.steered && (item.status === "submitted" || item.status === "consumed"),
  );
}

type InterruptResult = "sent" | "gone" | "failed";

/** The store status of a turn that ended for a recorded reason: the owner's stop cancels it. */
export function endedStatus(interruption: TurnInterruption | null) {
  return interruption === "stop" ? "cancelled" : "interrupted";
}

/**
 * Runs assigned turns against the harness host and records every canonical event in the local
 * store before anything else sees it. The store row decides the turn's state.
 */
export function createTurnExecutor(
  context: RuntimeContext,
  deps: { requests: RequestBridge; epochs: Epochs },
) {
  const live = new Map<string, LiveTurn>();
  const starting = new Set<string>();
  /** Turns that left the live map but whose end the store has not committed yet. */
  const ending = new Set<string>();
  /** Folders held without a live turn, such as while native compaction runs. */
  const heldFolders = new Set<string>();
  /** Failed starts per session since the last good one, and kept turns that wait to start. */
  const backoff = new Map<string, { attempts: number; since: number }>();
  const waitUntil = new Map<string, number>();
  /**
   * The worker has the current agent folders. Agent changes, a failed start and a lost native
   * session clear it: the next start synchronizes, which also starts a worker that is gone.
   */
  let synchronized = false;

  async function closeNative(sessionId: string) {
    await context.harness
      .execute({ type: "close", organizationId: context.organizationId, sessionId })
      .catch(() => {});
  }

  /**
   * A helper whose turn ended without its report has failed: its parent is told, so that no
   * helper runs forever. A completed or interrupted turn keeps its helper running only while
   * its session has more work, such as a parent message or a resume item.
   */
  async function settleHelper(sessionId: string, status: TurnStatus | undefined) {
    const session = await context.store.sessions.get(sessionId);
    if (session?.kind !== "helper") return;
    const helper = await context.store.helpers.bySession(session.id);
    if (helper?.status !== "running") return;
    if (status === "completed" || status === "interrupted") {
      const queued = (await context.store.inbox.openForSessions([session.id])).length;
      if (queued) return;
    }
    await context.store.helpers.finish(session.id, null, context.now());
  }

  async function needsAttention(turn: TurnRow, reason: "resume_failed" | "failed", error: string) {
    live.delete(turn.id);
    await deps.requests.closeTurn(turn.id);
    let status: TurnStatus | undefined;
    if (turn.handoff) {
      // A handoff that cannot run still ends its epoch; it never needs the owner.
      await closeNative(turn.sessionId);
      status = (
        await context.store.turns.finish(turn.id, { status: "failed", error }, context.now())
      )?.turn.status;
    } else
      status = (await context.store.turns.attention(turn.id, reason, error, context.now()))?.turn
        .status;
    await settleHelper(turn.sessionId, status);
    context.changed({ userAgentId: turn.userAgentId, turnId: turn.id });
  }

  /**
   * A passing failure: the turn's work waits durably and runs again after a backoff. A failure
   * that is not a known outage stops retrying after a while and needs the owner. A turn that
   * already started natively cannot go back to the inbox: it lost its native turn, so it
   * follows the recovery rules.
   */
  async function retryLater(turn: TurnRow, error: unknown) {
    const state = live.get(turn.id);
    const row = await context.store.turns.get(turn.id);
    if (row && row.status !== "assigned" && liveTurnStatuses.includes(row.status))
      return lostNative(
        state ?? { turnId: turn.id, sessionId: turn.sessionId, userAgentId: turn.userAgentId },
        { close: true },
      );
    live.delete(turn.id);
    synchronized = false;
    const now = context.now();
    const previous = backoff.get(turn.sessionId);
    const failures = { attempts: (previous?.attempts ?? 0) + 1, since: previous?.since ?? now };
    backoff.set(turn.sessionId, failures);
    if (
      !outage(error) &&
      (failures.attempts > unknownFailureRetries || now - failures.since >= unknownFailureWindowMs)
    ) {
      backoff.delete(turn.sessionId);
      return needsAttention(turn, "failed", "The agent's work could not start. Try again.");
    }
    const delay = Math.min(outageBackoffMs * 2 ** (failures.attempts - 1), outageBackoffMaxMs);
    const result = await context.store.turns.requeue(turn.id, now + delay, now);
    if (result === "kept") waitUntil.set(turn.id, now + delay);
    context.log("Agent work waits for Substrate or the harness to be reachable.");
    context.later(() => context.changed({}), delay);
    context.changed({ userAgentId: turn.userAgentId });
  }

  /** The owner may stop a turn while it starts. Each step checks that it is still wanted. */
  async function stillAssigned(turnId: string) {
    return (await context.store.turns.get(turnId))?.status === "assigned";
  }

  async function resumeNote(turnId: string, previousAttempt: number): Promise<EnvelopeResumeNote> {
    const events = await context.store.events.ofKinds(turnId, ["tool_started", "tool_completed"]);
    const titles = new Map<string, string>();
    const completed: string[] = [];
    for (const event of events) {
      if (event.kind === "tool_started" && event.itemId) titles.set(event.itemId, event.data.title);
      if (event.kind === "tool_completed" && event.itemId)
        completed.push(titles.get(event.itemId) ?? event.itemId);
    }
    const outputs = (await context.store.outputs.forTurn(turnId)).map(
      (output) => `${output.targetKind} ${output.targetId}`,
    );
    return { turnId, previousAttempt, completedTools: completed, outputs };
  }

  /**
   * The session's prefix for this epoch. Built once, so it stays byte-stable. A handoff turn
   * runs in the old epoch, so it keeps the old prefix even when the policy changed.
   */
  async function prefix(session: SessionRow, agentName: string, handoff: boolean) {
    if (session.prefix && (handoff || session.policyVersion === POLICY_VERSION))
      return { value: session.prefix, policyVersion: session.policyVersion ?? POLICY_VERSION };
    const value = managedPrefix({
      agentName,
      agentId: session.agentId,
      organizationId: session.organizationId,
      profile: await context.profile(session.agentId),
    });
    await context.store.sessions.setPrefix(session.id, value, POLICY_VERSION, context.now());
    return { value, policyVersion: POLICY_VERSION };
  }

  async function changes(session: SessionRow) {
    if (session.epoch === 0 || session.epochTurns > 0) return [];
    const handoff = await context.store.epochs.handoff(session.id, session.epoch - 1);
    if (!handoff) return [];
    return [
      [
        "Handoff from the previous session of this conversation.",
        `Objectives: ${handoff.objectives}`,
        `Open work: ${handoff.openWork || "(none)"}`,
        `References: ${handoff.references.join(", ") || "(none)"}`,
      ].join("\n"),
    ];
  }

  async function start(turn: TurnRow) {
    const session = await context.store.sessions.get(turn.sessionId);
    let agent;
    try {
      agent = session ? await context.agents.get(session.userAgentId) : undefined;
    } catch (error) {
      // The catalog is unreachable: the agent is not known to be gone.
      return retryLater(turn, error);
    }
    if (!session || !agent?.enabled)
      return needsAttention(turn, "failed", "The agent is not set up on this desktop.");
    if (!agent.home) {
      // The agent moved to another desktop. Its work does not run here, and its helpers end.
      const now = context.now();
      if ((await context.store.turns.requeue(turn.id, now, now)) === "kept")
        await context.store.turns.finish(turn.id, { status: "interrupted" }, now);
      await settleHelper(turn.sessionId, "failed");
      context.changed({ userAgentId: turn.userAgentId });
      return;
    }
    const items = batchItems(await context.store.inbox.forTurn(context.organizationId, turn.id));
    const { messageIds, invocationIds } = sourceRequest(items);
    let sources;
    try {
      sources = await context.server.sources(context.organizationId, messageIds, invocationIds);
    } catch (error) {
      return retryLater(turn, error);
    }
    const messages = new Map(sources.messages.map((message) => [message.id, message]));
    const inaccessible = inaccessibleItems(items, sources);
    await context.store.inbox.drop(
      context.organizationId,
      inaccessible.map((item) => item.id),
      "source_inaccessible",
    );
    const remaining = sortItems(items.filter((item) => !inaccessible.includes(item)));
    const envelopeItems = remaining.flatMap((item) => {
      const rendered = envelopeItem(item, { sessionKind: session.kind, messages });
      return rendered ? [rendered] : [];
    });
    if (!envelopeItems.length && turn.attempt === 1) {
      await context.store.turns.discard(turn.id, context.now());
      context.changed({ userAgentId: turn.userAgentId });
      return;
    }
    let resume: EnvelopeResumeNote | null = null;
    if (turn.attempt > 1) resume = await resumeNote(turn.id, turn.attempt - 1);
    else if (turn.resumesTurnId) {
      const previous = await context.store.turns.get(turn.resumesTurnId);
      if (previous) resume = await resumeNote(previous.id, previous.attempt);
    }
    const envelope = renderEnvelope({
      time: new Date(context.now()).toISOString(),
      session: session.kind,
      kind: turn.kind,
      attempt: turn.attempt,
      changes: await changes(session),
      items: envelopeItems,
      resume,
    });
    synchronized ||= await context.harness.synchronize().then(
      () => true,
      () => false,
    );
    const managed = await prefix(session, agent.name, turn.handoff);
    await context.store.turns.prepared(turn.id, {
      envelope,
      prefixHash: sha256(managed.value),
      sourceMessages: sources.messages.map((message) => ({
        messageId: message.id,
        conversationId: message.conversationId,
        threadId: message.threadId,
        createdAt: message.createdAt,
      })),
    });
    // Resume failures on later epochs, handoffs, and recovery paths need more than a silent restart.
    const requireResume =
      Boolean(session.nativeSessionId) &&
      (session.epoch > 0 || turn.handoff || turn.attempt > 1 || turn.resumesTurnId !== null);
    const open: Extract<HarnessCommand, { type: "open" }> = {
      type: "open",
      organizationId: context.organizationId,
      sessionId: session.id,
      agentId: session.agentId,
      folder: folderOf(session),
      epoch: session.epoch,
      requireResume,
      prefix: managed.value,
    };
    if (session.nativeSessionId) open.nativeSessionId = session.nativeSessionId;
    if (!(await stillAssigned(turn.id))) return;
    let opened;
    try {
      opened = await context.harness.execute(open);
    } catch (error) {
      if (errorCode(error) === "resume-failed")
        return needsAttention(
          turn,
          "resume_failed",
          "The agent's previous session could not resume.",
        );
      if (transient(error)) return retryLater(turn, error);
      return needsAttention(turn, "failed", "The agent could not start. Check its harness setup.");
    }
    if (opened.nativeSessionId !== session.nativeSessionId)
      await context.store.sessions.opened(
        session.id,
        {
          nativeSessionId: opened.nativeSessionId,
          prefix: managed.value,
          policyVersion: managed.policyVersion,
        },
        context.now(),
      );
    if (!(await stillAssigned(turn.id))) return;
    const origin = session.originConversationId
      ? { conversationId: session.originConversationId, threadId: session.originThreadId }
      : null;
    const destination = session.destinationConversationId
      ? { conversationId: session.destinationConversationId, threadId: session.destinationThreadId }
      : null;
    const state: LiveTurn = {
      turnId: turn.id,
      sessionId: session.id,
      userAgentId: session.userAgentId,
      folderKey: turn.folderKey,
      harness: session.harness,
      kind: turn.kind,
      generation: turn.generation,
      epoch: turn.epoch,
      handoff: turn.handoff,
      startedAt: context.now(),
      capabilities: opened.capabilities,
      stillQueued: [],
      usage: turn.usage,
      activity: turn.activity,
      conversationId: (destination ?? origin)?.conversationId ?? null,
      threadId: (destination ?? origin)?.threadId ?? null,
      chain: Promise.resolve(),
    };
    live.set(turn.id, state);
    const turnContext: TurnContext = {
      turnId: turn.id,
      attempt: turn.attempt,
      sessionKey: session.key,
      origin,
      kind: turn.kind,
      installationId: context.installationId,
    };
    if (destination) turnContext.destination = destination;
    if (turn.handoff) turnContext.purpose = "handoff";
    try {
      await context.harness.execute({
        type: "turn",
        organizationId: context.organizationId,
        sessionId: session.id,
        turnId: turn.id,
        generation: turn.generation,
        mode: turn.kind,
        input: { inputIds: remaining.map((item) => item.id), text: envelope },
        context: turnContext,
      });
    } catch (error) {
      if (live.get(turn.id) !== state) return;
      // Events the host sent before the failure, such as turn.started, are recorded first.
      await state.chain;
      if (live.get(turn.id) !== state) return;
      if (transient(error)) return retryLater(turn, error);
      return needsAttention(turn, "failed", "The agent's turn could not start.");
    }
    backoff.delete(session.id);
    const now = await context.store.turns.get(turn.id);
    if (!now || now.status === "cancelled" || now.status === "interrupted")
      // Stopped while the turn command was on its way: stop the native turn too.
      await context.harness
        .execute({
          type: "interrupt",
          organizationId: context.organizationId,
          sessionId: session.id,
          turnId: turn.id,
        })
        .catch(() => {});
    context.changed({ userAgentId: turn.userAgentId, turnId: turn.id });
  }

  /**
   * The store status of a turn's end. A turn that the owner or the runtime asked to end may
   * fail instead of reporting an interrupt, such as when its native session closes under it:
   * the recorded intent decides then.
   */
  function finishedStatus(
    state: LiveTurn,
    turn: TurnRow | undefined,
    result: TurnResult,
  ): FinishTurnInput["status"] {
    if (result.status === "completed") return "completed";
    const intent = turn?.status === "stopping" ? turn.interruption : null;
    if (result.status === "failed" && !intent) return state.handoff ? "failed" : "needs_attention";
    return endedStatus(intent);
  }

  /**
   * Ends a live turn once. A handoff closes its native session before the store commits the
   * next epoch. A completed turn holds its folder until native compaction, if any, finished.
   */
  async function finish(state: LiveTurn, result: TurnResult, options: { resume?: string } = {}) {
    if (live.get(state.turnId) !== state) return;
    live.delete(state.turnId);
    ending.add(state.turnId);
    try {
      await finishLive(state, result, options);
    } finally {
      ending.delete(state.turnId);
    }
  }

  async function finishLive(state: LiveTurn, result: TurnResult, options: { resume?: string }) {
    const turn = await context.store.turns.get(state.turnId);
    const status = finishedStatus(state, turn, result);
    const outputs = await context.store.outputs.forTurn(state.turnId);
    const usage = result.usage ?? state.usage;
    await deps.requests.closeTurn(state.turnId);
    if (state.handoff) await closeNative(state.sessionId);
    const resume = options.resume ?? interruptionNote(turn?.interruption ?? null);
    const resumes = resume !== null && status === "interrupted";
    const input: FinishTurnInput = {
      status,
      outcome: status === "needs_attention" ? null : turnOutcome(outputs),
      error: result.error ?? null,
      attentionReason: status === "needs_attention" ? "failed" : null,
      consumedInputIds: result.consumedInputIds ?? [],
      stillQueuedInputIds: state.stillQueued,
      usage,
    };
    if (resumes) input.resume = resume;
    const compactable = status === "completed" && !state.handoff;
    if (compactable) heldFolders.add(state.folderKey);
    try {
      const finished = await context.store.turns.finish(state.turnId, input, context.now());
      // Work that resumes later keeps its helper running.
      if (!resumes) await settleHelper(state.sessionId, finished?.turn.status);
      if (compactable && finished?.turn.status === "completed")
        await deps.epochs.afterTurn(state.sessionId, usage, state.capabilities);
    } finally {
      heldFolders.delete(state.folderKey);
    }
    const change: AgentWorkChange = { userAgentId: state.userAgentId, turnId: state.turnId };
    if (state.conversationId) change.conversationId = state.conversationId;
    context.changed(change);
  }

  /**
   * A live turn lost its native turn: the native session closed under it, such as when the
   * worker exited, or the turn command failed after the turn started. The turn is interrupted
   * and follows the recovery rules: it continues once when that is safe. close ends a native
   * turn whose state is unknown first, so that a continue never finds it still running.
   */
  async function lostNative(
    state: Pick<LiveTurn, "turnId" | "sessionId" | "userAgentId">,
    options: { close?: boolean } = {},
  ) {
    const current = live.get(state.turnId);
    if (current && current !== state) return;
    live.delete(state.turnId);
    synchronized = false;
    ending.add(state.turnId);
    try {
      if (options.close) await closeNative(state.sessionId);
      await deps.requests.closeTurn(state.turnId, "orphaned");
      const decision = await context.store.turns.recoverOne(state.turnId, context.now());
      if (decision && decision.action !== "continue" && decision.action !== "requeued")
        await settleHelper(state.sessionId, decision.action);
    } finally {
      ending.delete(state.turnId);
    }
    context.changed({ userAgentId: state.userAgentId, turnId: state.turnId });
  }

  async function handle(state: LiveTurn, event: HarnessEvent) {
    const now = context.now();
    const append = context.store.events.append.bind(null, state.turnId);
    switch (event.type) {
      case "turn.started":
        await context.store.turns.running(state.turnId, now, [{ kind: "turn_started", data: {} }]);
        return;
      case "text":
        if (event.text) await append([{ kind: "text", data: { text: event.text } }], now);
        return;
      case "item.started":
        state.activity = event.title;
        await append(
          [
            {
              kind: "tool_started",
              itemId: event.itemId,
              data: { itemType: event.itemType, title: event.title },
            },
          ],
          now,
        );
        context.progressed({ userAgentId: state.userAgentId, turnId: state.turnId });
        return;
      case "item.completed":
        await append(
          [{ kind: "tool_completed", itemId: event.itemId, data: { status: event.status } }],
          now,
        );
        return;
      case "request.opened":
        await deps.requests.opened(state, event);
        return;
      case "input.consumed":
        await context.store.inbox.consumed(state.turnId, event.inputId, now, [
          { kind: "input_consumed", data: { inputId: event.inputId } },
        ]);
        context.changed({ userAgentId: state.userAgentId, turnId: state.turnId });
        return;
      case "usage.updated":
        state.usage = event.usage;
        await append([{ kind: "usage", data: { usage: event.usage } }], now);
        return;
      case "compaction":
        await append([{ kind: "note", data: { text: "Compacted the context." } }], now);
        return;
      case "error":
        await append([{ kind: "error", data: { code: event.code, message: event.message } }], now);
        return;
      case "turn.completed":
        await finish(state, event.result);
        return;
      case "session.closed":
        await lostNative(state);
        return;
    }
  }

  /** Native output between our turns belongs to no turn: a note on the session's latest turn. */
  async function noteOutside(event: Extract<HarnessEvent, { type: "text" }>) {
    if (!event.text) return;
    const session = await context.store.sessions.get(event.sessionId);
    if (session?.organizationId !== context.organizationId) return;
    const latest = (await context.store.turns.forSessions([session.id], { limit: 1 })).at(0);
    if (!latest) return;
    await context.store.events.append(
      latest.id,
      [{ kind: "note", data: { text: event.text } }],
      context.now(),
    );
    context.progressed({ userAgentId: latest.userAgentId, turnId: latest.id });
  }

  let outside = Promise.resolve();

  /**
   * Interrupts a live turn. The worker's turn.completed event ends it. "gone" means the worker
   * has no live turn for it: the turn already stopped.
   */
  async function interrupt(turnId: string): Promise<InterruptResult> {
    const state = live.get(turnId);
    if (!state) return "gone";
    try {
      const receipt = await context.harness.execute({
        type: "interrupt",
        organizationId: context.organizationId,
        sessionId: state.sessionId,
        turnId,
      });
      state.stillQueued.push(...(receipt.stillQueuedInputIds ?? []));
      return "sent";
    } catch (error) {
      return errorCode(error) === "no-live-turn" ? "gone" : "failed";
    }
  }

  return {
    live,
    heldFolders,
    closeNative,
    settleHelper,
    /** Agent settings changed: the next start writes the agent folders again. */
    unsynchronize() {
      synchronized = false;
    },
    /** Starts every assigned turn that this process is not running yet. */
    async startAssigned() {
      const now = context.now();
      for (const turn of await context.store.turns.assigned(context.organizationId)) {
        if (live.has(turn.id) || starting.has(turn.id) || ending.has(turn.id)) continue;
        if ((waitUntil.get(turn.id) ?? 0) > now) continue;
        waitUntil.delete(turn.id);
        starting.add(turn.id);
        void start(turn)
          .catch(() => needsAttention(turn, "failed", "The agent could not start."))
          .finally(() => starting.delete(turn.id));
      }
    },
    /** Events are recorded in arrival order per turn. Stale generations are ignored. */
    onEvent(event: HarnessEvent) {
      let state: LiveTurn | undefined;
      if (event.turnId) state = live.get(event.turnId);
      else if (event.type === "session.closed")
        state = [...live.values()].find((entry) => entry.sessionId === event.sessionId);
      else if (event.type === "text") {
        outside = outside
          .then(() => noteOutside(event))
          .catch(() => context.log("Could not record agent output."));
        return;
      }
      if (!state || state.sessionId !== event.sessionId) return;
      if (event.turnId && event.generation !== null && event.generation !== state.generation)
        return;
      const target = state;
      target.chain = target.chain
        .then(() => handle(target, event))
        .catch(() => context.log("Could not record an agent event."));
    },
    interrupt,
    /** Ends a live turn without a worker result, such as when the worker is gone. */
    async abandon(turnId: string, result: TurnResult, options: { resume?: string } = {}) {
      const state = live.get(turnId);
      if (state) await finish(state, result, options);
    },
    /**
     * Ends live turns for a reason. It records the reason first, unless a turn already stops,
     * so that the close finishes each turn as cancelled or interrupted. Then it ends the native
     * turns, handles the events the host sent before, and ends each row that the host did not
     * end. By default it closes each session; interrupt interrupts each turn first, and close
     * replaces the session closes, such as with a close of every session of the organization.
     */
    async end(
      turnIds: string[],
      interruption: TurnInterruption,
      native: { interrupt?: boolean; close?: () => Promise<void> } = {},
    ) {
      const states = turnIds.flatMap((turnId) => {
        const state = live.get(turnId);
        return state ? [state] : [];
      });
      for (const state of states) {
        const turn = await context.store.turns
          .get(state.turnId)
          .catch(() => context.log("Could not end an agent turn."));
        if (turn && turn.status !== "stopping")
          await context.store.turns
            .stopping(state.turnId, interruption)
            .catch(() => context.log("Could not end an agent turn."));
      }
      if (native.close) await native.close();
      else
        for (const state of states) {
          if (native.interrupt) await interrupt(state.turnId);
          await closeNative(state.sessionId);
        }
      for (const state of states) {
        // The host's turn.completed arrives before the close answers; it is handled first.
        await state.chain;
        await finish(state, { status: "interrupted" }).catch(() =>
          context.log("Could not end an agent turn."),
        );
      }
    },
  };
}
export type TurnExecutor = ReturnType<typeof createTurnExecutor>;
