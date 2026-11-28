import type { NativeSessionRow, NewTurnEvent } from "@substrate/client-storage/agent-work";
import { agentApps, managedPrefix, POLICY_VERSION } from "@substrate/contracts/agent-tools";
import {
  agentActivityMaxLength,
  type EnvelopeResumeNote,
  type TurnAttentionReason,
  type TurnInterruption,
} from "@substrate/contracts/agent-work";
import { interruptionNote, type HostTurn } from "@substrate/contracts/agent-work/control";
import {
  harnessCodesWithClassification,
  type HarnessCommand,
  type HarnessEvent,
  type HarnessFolder,
  type TurnResult,
  type Usage,
} from "@substrate/contracts/harness-runtime";

import type { CatalogAgent, HostFinish, HostProgress } from "../ports.ts";
import {
  envelopeItem,
  localTime,
  renderEnvelope,
  sortItems,
  unsentAnswerNudge,
} from "../turns/envelope.ts";
import { turnOutcome } from "../turns/outcome.ts";
import type { LiveTurn, RuntimeContext } from "./context.ts";
import type { Epochs } from "./epochs.ts";
import type { RequestBridge } from "./requests.ts";
import { inaccessibleItems, sourceRequest } from "./source-check.ts";
import { createHash } from "node:crypto";
import { z } from "zod";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

const transientHarnessCodes = harnessCodesWithClassification("transient");
const outageBackoffMs = 5_000;
const outageBackoffMaxMs = 5 * 60_000;
const unknownFailureRetries = 6;
const unknownFailureWindowMs = 30 * 60_000;
const reportDelayMs = 2_000;
const stopTimeoutMs = 20_000;
const releasedCodes = new Set(["CONFLICT", "NOT_FOUND", "FORBIDDEN"]);

const codedError = z.object({ code: z.string() });

export function errorCode(cause: unknown) {
  return codedError.safeParse(cause).data?.code;
}

/**
 * A known outage: the harness, the worker or the network is gone for now. fetch rejects with
 * a TypeError when the network fails; the controller uses a code when it cannot verify the
 * session.
 */
function outage(cause: unknown) {
  const code = errorCode(cause);
  if (code !== undefined) return transientHarnessCodes.has(code);
  return cause instanceof TypeError;
}

function transient(cause: unknown) {
  return errorCode(cause) === undefined || outage(cause);
}

function endedStatus(interruption: TurnInterruption | null) {
  return interruption === "stop" ? "cancelled" : "interrupted";
}

function folderOf(session: HostTurn["session"]): HarnessFolder {
  return session.kind === "helper" && session.helperId ? { helperId: session.helperId } : "main";
}

type InterruptResult = "sent" | "gone" | "failed";
type TurnRef = Pick<LiveTurn, "turnId" | "attempt" | "sessionId" | "userAgentId" | "handoff">;

const refOf = (turn: HostTurn["turn"]): TurnRef => ({
  turnId: turn.id,
  attempt: turn.attempt,
  sessionId: turn.sessionId,
  userAgentId: turn.userAgentId,
  handoff: turn.handoff,
});

interface PendingReport {
  cancel: () => void;
  activity?: string;
  usage?: Usage;
  consumed: Set<string>;
}

export function createTurnExecutor(
  context: RuntimeContext,
  deps: { requests: RequestBridge; epochs: Epochs },
) {
  const live = new Map<string, LiveTurn>();
  const starting = new Map<string, number>();
  const newerAttempt = new Set<string>();
  const ending = new Set<string>();
  const heldFolders = new Set<string>();
  const backoff = new Map<string, { attempts: number; since: number }>();
  const waitUntil = new Map<string, number>();
  const stopRequests = new Map<string, TurnInterruption>();
  const unreported = new Map<string, { attempt: number; input: HostFinish }>();
  const reports = new Map<string, PendingReport>();
  let synchronized = false;
  const org = context.organizationId;

  const append = (turn: Pick<TurnRef, "turnId" | "attempt">, events: NewTurnEvent[]) =>
    context.store.events.append(org, turn, events, context.now());

  async function closeNative(sessionId: string) {
    await context.harness
      .execute({ type: "close", organizationId: org, sessionId })
      .catch(() => {});
  }

  async function progress(state: Pick<TurnRef, "turnId" | "attempt">, input: HostProgress) {
    try {
      const status = await context.host.progress(org, state.turnId, input);
      if (status === "stopping") context.changed({});
    } catch (error) {
      if (!transient(error)) context.changed({});
    }
  }

  async function flush(state: LiveTurn) {
    const pending = reports.get(state.turnId);
    if (!pending) return;
    reports.delete(state.turnId);
    pending.cancel();
    const input: HostProgress = { attempt: state.attempt, consumedItemIds: [...pending.consumed] };
    if (pending.activity !== undefined) input.activity = pending.activity;
    if (pending.usage) input.usage = pending.usage;
    await progress(state, input);
  }

  function report(
    state: LiveTurn,
    fields: { activity?: string; usage?: Usage; consumed?: string },
  ) {
    let pending = reports.get(state.turnId);
    if (!pending) {
      const created: PendingReport = { cancel: () => {}, consumed: new Set() };
      created.cancel = context.later(() => {
        if (reports.get(state.turnId) === created && live.get(state.turnId) === state)
          void flush(state);
      }, reportDelayMs);
      reports.set(state.turnId, created);
      pending = created;
    }
    if (fields.activity !== undefined) pending.activity = fields.activity;
    if (fields.usage) pending.usage = fields.usage;
    if (fields.consumed) pending.consumed.add(fields.consumed);
  }

  async function reportEnd(turn: Pick<TurnRef, "turnId" | "attempt">, input: HostFinish) {
    try {
      const result = await context.host.finish(org, turn.turnId, input);
      unreported.delete(turn.turnId);
      return result;
    } catch (error) {
      if (transient(error)) unreported.set(turn.turnId, { attempt: turn.attempt, input });
      else unreported.delete(turn.turnId);
      context.log("Could not report the end of an agent turn.");
      return null;
    }
  }

  async function needsAttention(turn: TurnRef, reason: TurnAttentionReason, error: string) {
    live.delete(turn.turnId);
    await deps.requests.closeTurn(turn.turnId);
    if (turn.handoff) {
      await closeNative(turn.sessionId);
      await reportEnd(turn, { attempt: turn.attempt, status: "failed", error });
      await context.store.nativeSessions.rotate(org, turn.sessionId, context.now());
    } else
      await reportEnd(turn, {
        attempt: turn.attempt,
        status: "needs_attention",
        attentionReason: reason,
        error,
      });
    context.changed({ userAgentId: turn.userAgentId, turnId: turn.turnId });
  }

  async function endUnstarted(turn: TurnRef, interruption: TurnInterruption) {
    stopRequests.delete(turn.turnId);
    await reportEnd(turn, {
      attempt: turn.attempt,
      status: endedStatus(interruption),
      interruption,
    });
    context.changed({ userAgentId: turn.userAgentId, turnId: turn.turnId });
  }

  async function retryLater(turn: TurnRef, cause: unknown) {
    const state = live.get(turn.turnId);
    if (state) return lostNative(state, { close: true });
    synchronized = false;
    const now = context.now();
    const previous = backoff.get(turn.sessionId);
    const failures = { attempts: (previous?.attempts ?? 0) + 1, since: previous?.since ?? now };
    backoff.set(turn.sessionId, failures);
    if (
      !outage(cause) &&
      (failures.attempts > unknownFailureRetries || now - failures.since >= unknownFailureWindowMs)
    ) {
      backoff.delete(turn.sessionId);
      return needsAttention(turn, "failed", "The agent's work could not start. Try again.");
    }
    const delay = Math.min(outageBackoffMs * 2 ** (failures.attempts - 1), outageBackoffMaxMs);
    const result = await context.host
      .retryLater(org, turn.turnId, { attempt: turn.attempt, delayMs: delay })
      .catch(() => "kept" as const);
    if (result === "kept") waitUntil.set(turn.turnId, now + delay);
    context.log("Agent work waits for Substrate or the harness to be reachable.");
    context.later(() => context.changed({}), delay);
    context.changed({ userAgentId: turn.userAgentId });
  }

  async function resumeNote(turnId: string, previousAttempt: number): Promise<EnvelopeResumeNote> {
    const events = await context.store.events.ofKinds(org, turnId, [
      "tool_started",
      "tool_completed",
      "output",
    ]);
    const titles = new Map<string, string>();
    const completed: string[] = [];
    const outputs: string[] = [];
    for (const event of events) {
      if (event.kind === "tool_started" && event.itemId) titles.set(event.itemId, event.data.title);
      if (event.kind === "tool_completed" && event.itemId)
        completed.push(titles.get(event.itemId) ?? event.itemId);
      if (event.kind === "output") outputs.push(`${event.data.kind} ${event.data.id}`);
    }
    return { turnId, previousAttempt, completedTools: completed, outputs };
  }

  async function prefix(native: NativeSessionRow, agent: CatalogAgent, handoff: boolean) {
    if (native.prefix && (handoff || native.policyVersion === POLICY_VERSION))
      return {
        value: native.prefix,
        policyVersion: native.policyVersion ?? POLICY_VERSION,
        workspace: native.workspace,
      };
    const enabledApps = await context.enabledApps?.();
    const value = managedPrefix({
      agentName: agent.name,
      agentId: native.userAgentId,
      organizationId: org,
      enabledApps: enabledApps && agentApps(enabledApps, agent),
    });
    const workspace = native.prefix
      ? native.workspace
      : await context.store.workspaces.get(org, native.userAgentId);
    await context.store.nativeSessions.setPrefix(
      org,
      native.sessionId,
      { prefix: value, policyVersion: POLICY_VERSION, workspace },
      context.now(),
    );
    return { value, policyVersion: POLICY_VERSION, workspace };
  }

  async function changes(native: NativeSessionRow) {
    if (native.epoch === 0 || native.epochTurns > 0) return [];
    const handoff = await context.store.handoffs.get(org, native.sessionId, native.epoch - 1);
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

  async function nativeSession(hostTurn: HostTurn, harness: NativeSessionRow["harness"]) {
    const { turn, session } = hostTurn;
    const now = context.now();
    const native = await context.store.nativeSessions.ensure(
      org,
      { sessionId: session.id, userAgentId: session.userAgentId, harness },
      now,
    );
    const reset = session.resetGeneration > native.resetGeneration;
    if (!reset && (!native.rotation || turn.handoff)) return native;
    await closeNative(session.id);
    if (reset)
      await context.store.nativeSessions.applyReset(org, session.id, session.resetGeneration, now);
    else await context.store.nativeSessions.rotate(org, session.id, now);
    return (await context.store.nativeSessions.get(org, session.id))!;
  }

  async function input(hostTurn: HostTurn) {
    const { turn, session } = hostTurn;
    const batch = hostTurn.items.filter((item) => !item.steered && item.status === "submitted");
    const sources = await context.server.sources(org, sourceRequest(batch));
    const messages = new Map(sources.messages.map((message) => [message.id, message]));
    const inaccessible = inaccessibleItems(batch, sources);
    const remaining = sortItems(batch.filter((item) => !inaccessible.includes(item)));
    const items = remaining.flatMap((item) => {
      const rendered = envelopeItem(item, { sessionKind: session.kind, messages });
      return rendered ? [rendered] : [];
    });
    if (session.kind === "thread" && !turn.handoff && session.origin?.threadId) {
      const { conversationId, threadId } = session.origin;
      const page = await context.server.threadMessages(org, conversationId, threadId);
      const ids = [...new Set([threadId, ...page.map((message) => message.id)])].filter(
        (id) => !messages.has(id),
      );
      const snapshot = await context.server.sources(org, ids);
      for (const message of snapshot.messages) messages.set(message.id, message);
      items.unshift(
        ...snapshot.messages.map((message) => ({
          id: message.id,
          source: "thread_context" as const,
          author: message.author.name,
          authorKind: message.author.kind,
          conversationId: message.conversationId,
          threadId: message.threadId,
          messageId: message.id,
          body: message.body,
        })),
      );
      sources.messages.push(...snapshot.messages);
    }
    return { sources, messages, inaccessible, remaining, items };
  }

  async function start(hostTurn: HostTurn) {
    const { turn, session } = hostTurn;
    const ref = refOf(turn);
    let agent;
    try {
      agent = await context.agents.get(turn.userAgentId);
      if (!agent?.enabled) {
        context.agents.invalidate();
        agent = await context.agents.get(turn.userAgentId);
      }
    } catch (error) {
      return retryLater(ref, error);
    }
    if (!agent?.enabled)
      return needsAttention(ref, "failed", "The agent is not set up on this desktop.");
    const native = await nativeSession(hostTurn, agent.harness);
    let loaded;
    try {
      loaded = await input(hostTurn);
    } catch (error) {
      return retryLater(ref, error);
    }
    let resume: EnvelopeResumeNote | null = null;
    if (turn.attempt > 1) resume = await resumeNote(turn.id, turn.attempt - 1);
    else if (turn.resumesTurnId) {
      const previous = (await context.store.turnRuns.forTurn(org, turn.resumesTurnId)).at(-1);
      if (previous) resume = await resumeNote(previous.turnId, previous.attempt);
    }
    const envelope = renderEnvelope({
      time: new Date(context.now()).toISOString(),
      local: localTime(context.now()),
      session: session.kind,
      kind: turn.kind,
      attempt: turn.attempt,
      changes: await changes(native),
      items: loaded.items,
      resume,
    });
    synchronized ||= await context.harness.synchronize().then(
      () => true,
      () => false,
    );
    const managed = await prefix(native, agent, turn.handoff);
    const stop = stopRequests.get(turn.id);
    if (stop) return endUnstarted(ref, stop);
    let status;
    try {
      status = await context.host.start(org, turn.id, {
        attempt: turn.attempt,
        droppedItemIds: loaded.inaccessible.map((item) => item.id),
      });
    } catch (error) {
      if (releasedCodes.has(errorCode(error) ?? "")) return context.changed({});
      return retryLater(ref, error);
    }
    if (status === "stopping") return endUnstarted(ref, turn.interruption ?? "stop");
    if (status !== "running" && status !== "waiting") {
      context.changed({ userAgentId: turn.userAgentId, turnId: turn.id });
      return;
    }
    await context.store.turnRuns.begin(
      org,
      {
        turnId: turn.id,
        attempt: turn.attempt,
        sessionId: session.id,
        userAgentId: turn.userAgentId,
        epoch: native.epoch,
        envelope,
        prefixHash: sha256(managed.value),
      },
      context.now(),
    );
    const sourceMessages = loaded.sources.messages.map((message) => ({
      messageId: message.id,
      conversationId: message.conversationId,
      threadId: message.threadId,
      createdAt: message.createdAt,
    }));
    if (sourceMessages.length)
      await progress(ref, { attempt: turn.attempt, sourceMessages, consumedItemIds: [] });
    const laterEpoch = native.epoch > 0;
    const recovery = turn.attempt > 1 || turn.resumesTurnId !== null;
    const requireResume =
      Boolean(native.nativeSessionId) && (laterEpoch || turn.handoff || recovery);
    const open: Extract<HarnessCommand, { type: "open" }> = {
      type: "open",
      organizationId: org,
      sessionId: session.id,
      agentId: session.userAgentId,
      folder: folderOf(session),
      epoch: native.epoch,
      requireResume,
      prefix: managed.value,
      mcpServers: await context.store.mcpServers.list(org, session.userAgentId),
    };
    if (managed.workspace) open.workspace = managed.workspace;
    if (native.nativeSessionId) open.nativeSessionId = native.nativeSessionId;
    let opened;
    try {
      opened = await context.harness.execute(open);
    } catch (error) {
      if (errorCode(error) === "resume-failed")
        return needsAttention(
          ref,
          "resume_failed",
          "The agent's previous session could not resume.",
        );
      if (transient(error)) return retryLater(ref, error);
      if (errorCode(error) === "invalid-workspace")
        return needsAttention(
          ref,
          "failed",
          "The agent's working folder is missing or can't be used. Choose another in its settings.",
        );
      return needsAttention(ref, "failed", "The agent could not start. Check its harness setup.");
    }
    if (opened.nativeSessionId !== native.nativeSessionId)
      await context.store.nativeSessions.opened(
        org,
        session.id,
        {
          nativeSessionId: opened.nativeSessionId,
          prefix: managed.value,
          policyVersion: managed.policyVersion,
        },
        context.now(),
      );
    const stopped = stopRequests.get(turn.id);
    if (stopped) return endUnstarted(ref, stopped);
    const place = session.destination ?? session.origin;
    const state: LiveTurn = {
      ...ref,
      session,
      folderKey: turn.folderKey,
      harness: agent.harness,
      kind: turn.kind,
      generation: turn.generation,
      autoContinue: turn.autoContinue,
      ownerDm:
        session.kind === "dm" &&
        loaded.remaining.some((item) => {
          if (item.sourceRef.source !== "owner_message") return false;
          const source = loaded.messages.get(item.sourceRef.messageId);
          return (
            source?.conversationKind === "dm" &&
            source.author.kind === "owner" &&
            source.conversationId === session.origin?.conversationId
          );
        }),
      epoch: native.epoch,
      startedAt: context.now(),
      capabilities: opened.capabilities,
      items: loaded.remaining,
      steered: new Set(),
      consumed: new Set(),
      stillQueued: [],
      awaitingApprovals: new Set(),
      decided: new Set(),
      stopping: null,
      released: false,
      wrappedUp: !turn.autoContinue,
      usage: null,
      activity: null,
      conversationId: place?.conversationId ?? null,
      threadId: place?.threadId ?? null,
      sourceMessages,
      outputs: [],
      wroteText: false,
      nudged: false,
      chain: Promise.resolve(),
    };
    live.set(turn.id, state);
    try {
      await context.harness.execute({
        type: "turn",
        organizationId: org,
        sessionId: session.id,
        turnId: turn.id,
        generation: turn.generation,
        mode: turn.kind,
        input: { inputIds: loaded.remaining.map((item) => item.id), text: envelope },
        context: { turnId: turn.id, attempt: turn.attempt },
      });
    } catch (error) {
      if (live.get(turn.id) !== state) return;
      await state.chain;
      if (live.get(turn.id) !== state) return;
      if (transient(error)) return lostNative(state, { close: true });
      return needsAttention(ref, "failed", "The agent's turn could not start.");
    }
    backoff.delete(session.id);
    const late = stopRequests.get(turn.id);
    if (late) {
      stopRequests.delete(turn.id);
      await requestStop(turn.id, late);
    }
    context.changed({ userAgentId: turn.userAgentId, turnId: turn.id });
  }

  function finishedStatus(state: LiveTurn, result: TurnResult): HostFinish["status"] {
    if (result.status === "completed") return "completed";
    if (result.status === "failed" && !state.stopping)
      return state.handoff ? "failed" : "needs_attention";
    return endedStatus(state.stopping);
  }

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
    const status = finishedStatus(state, result);
    const usage = result.usage ?? state.usage;
    const pending = reports.get(state.turnId);
    pending?.cancel();
    reports.delete(state.turnId);
    await deps.requests.closeTurn(state.turnId);
    if (state.handoff) await closeNative(state.sessionId);
    const note = state.handoff ? null : interruptionNote(state.stopping);
    const resume = options.resume ?? note;
    const input: HostFinish = {
      attempt: state.attempt,
      status,
      outcome: status === "needs_attention" ? null : turnOutcome(state.outputs),
      error: result.error ?? null,
      attentionReason: status === "needs_attention" ? "failed" : null,
      interruption: state.stopping,
      consumedItemIds: [...new Set([...(result.consumedInputIds ?? []), ...state.consumed])],
      stillQueuedItemIds: state.stillQueued,
      usage,
    };
    if (resume !== null && status === "interrupted") input.resume = resume;
    if (state.decided.size) input.decidedRequestIds = [...state.decided];
    const compactable = status === "completed" && !state.handoff;
    if (compactable) heldFolders.add(state.folderKey);
    try {
      const finished = state.released ? null : await reportEnd(state, input);
      await append(state, [
        {
          kind: "turn_finished",
          data: { status: finished?.status ?? status, outcome: input.outcome ?? null },
        },
      ]).catch(() => {});
      if (state.handoff)
        await context.store.nativeSessions.rotate(org, state.sessionId, context.now());
      else if (compactable && finished?.status !== "needs_attention") {
        await context.store.nativeSessions.countTurn(org, state.sessionId, context.now());
        await deps.epochs.afterTurn(state.sessionId, usage, state.capabilities);
      }
    } finally {
      heldFolders.delete(state.folderKey);
    }
    context.changed({ userAgentId: state.userAgentId, turnId: state.turnId });
  }

  async function recover(turn: Pick<TurnRef, "turnId" | "attempt" | "userAgentId">) {
    await deps.requests
      .closeOrphans(turn)
      .catch(() => context.log("Could not close agent requests."));
    const unfinishedTool = await context.store.events.unfinishedTool(org, turn);
    try {
      await context.host.recover(org, turn.turnId, { attempt: turn.attempt, unfinishedTool });
    } catch {
      context.log("Could not recover an agent turn.");
    }
  }

  async function lostNative(state: LiveTurn, options: { close?: boolean } = {}) {
    if (live.get(state.turnId) !== state) return;
    live.delete(state.turnId);
    synchronized = false;
    ending.add(state.turnId);
    try {
      if (options.close) await closeNative(state.sessionId);
      if (state.stopping || state.released) await finishLive(state, { status: "interrupted" }, {});
      else {
        await flush(state);
        await deps.requests.closeTurn(state.turnId, "orphaned");
        await recover(state);
      }
    } finally {
      ending.delete(state.turnId);
    }
    context.changed({ userAgentId: state.userAgentId, turnId: state.turnId });
  }

  async function nudgeUnsentAnswer(state: LiveTurn, result: TurnResult) {
    const unsent =
      result.status === "completed" &&
      state.kind === "interactive" &&
      state.wroteText &&
      !state.nudged &&
      !state.handoff &&
      !state.stopping &&
      !state.released &&
      state.outputs.length === 0 &&
      state.items.some((item) => item.source === "owner_message");
    if (!unsent) return false;
    state.nudged = true;
    try {
      await context.harness.execute({
        type: "turn",
        organizationId: org,
        sessionId: state.sessionId,
        turnId: state.turnId,
        generation: state.generation,
        mode: state.kind,
        input: { inputIds: state.items.map((item) => item.id), text: unsentAnswerNudge },
        context: { turnId: state.turnId, attempt: state.attempt },
      });
      return true;
    } catch {
      return false;
    }
  }

  async function handle(state: LiveTurn, event: HarnessEvent) {
    switch (event.type) {
      case "turn.started":
        await append(state, [{ kind: "turn_started", data: {} }]);
        return;
      case "text":
        if (event.text) {
          state.wroteText = true;
          await append(state, [{ kind: "text", data: { text: event.text } }]);
        }
        return;
      case "item.started":
        state.activity = event.title;
        await append(state, [
          {
            kind: "tool_started",
            itemId: event.itemId,
            data: { itemType: event.itemType, title: event.title },
          },
        ]);
        report(state, { activity: event.title.slice(0, agentActivityMaxLength) });
        context.progressed({ userAgentId: state.userAgentId, turnId: state.turnId });
        return;
      case "item.completed":
        await append(state, [
          { kind: "tool_completed", itemId: event.itemId, data: { status: event.status } },
        ]);
        return;
      case "request.opened":
        await deps.requests.opened(state, event);
        return;
      case "request.closed":
        await deps.requests.withdrawn(state, event.requestId);
        return;
      case "input.consumed":
        state.consumed.add(event.inputId);
        await append(state, [{ kind: "input_consumed", data: { inputId: event.inputId } }]);
        if (state.steered.has(event.inputId)) report(state, { consumed: event.inputId });
        context.progressed({ userAgentId: state.userAgentId, turnId: state.turnId });
        return;
      case "usage.updated":
        state.usage = event.usage;
        await append(state, [{ kind: "usage", data: { usage: event.usage } }]);
        report(state, { usage: event.usage });
        return;
      case "compaction":
        await append(state, [{ kind: "note", data: { text: "Compacted the context." } }]);
        return;
      case "error":
        await append(state, [
          { kind: "error", data: { code: event.code, message: event.message } },
        ]);
        return;
      case "turn.completed":
        if (await nudgeUnsentAnswer(state, event.result)) return;
        await finish(state, event.result);
        return;
      case "session.closed":
        await lostNative(state);
        return;
    }
  }

  async function noteOutside(event: Extract<HarnessEvent, { type: "text" }>) {
    if (!event.text) return;
    const latest = await context.store.turnRuns.latestInSession(org, event.sessionId);
    if (!latest) return;
    await append(latest, [{ kind: "note", data: { text: event.text } }]);
    context.progressed({ userAgentId: latest.userAgentId, turnId: latest.turnId });
  }

  let outside = Promise.resolve();

  async function interrupt(turnId: string): Promise<InterruptResult> {
    const state = live.get(turnId);
    if (!state) return "gone";
    try {
      const receipt = await context.harness.execute({
        type: "interrupt",
        organizationId: org,
        sessionId: state.sessionId,
        turnId,
      });
      state.stillQueued.push(...(receipt.stillQueuedInputIds ?? []));
      return "sent";
    } catch (error) {
      return errorCode(error) === "no-live-turn" ? "gone" : "failed";
    }
  }

  async function abandon(turnId: string, result: TurnResult) {
    const state = live.get(turnId);
    if (state) await finish(state, result);
  }

  async function closeSessions(states: LiveTurn[]) {
    for (const state of states) await closeNative(state.sessionId);
  }

  async function interruptAndCloseSessions(states: LiveTurn[]) {
    for (const state of states) {
      await interrupt(state.turnId);
      await closeNative(state.sessionId);
    }
  }

  async function end(
    turnIds: string[],
    interruption: TurnInterruption,
    stopNative: (states: LiveTurn[]) => Promise<void> = closeSessions,
  ) {
    const states = turnIds.flatMap((turnId) => {
      const state = live.get(turnId);
      return state ? [state] : [];
    });
    for (const state of states) state.stopping ??= interruption;
    await stopNative(states);
    for (const state of states) {
      await state.chain;
      await finish(state, { status: "interrupted" }).catch(() =>
        context.log("Could not end an agent turn."),
      );
    }
  }

  async function requestStop(turnId: string, interruption: TurnInterruption) {
    const state = live.get(turnId);
    if (!state) {
      if (starting.has(turnId)) stopRequests.set(turnId, interruption);
      return;
    }
    if (state.stopping) return;
    state.stopping = interruption;
    const cancel = context.later(() => {
      if (live.get(turnId) === state)
        void end([turnId], interruption).catch(() =>
          context.log("Could not end a stopped agent turn."),
        );
    }, stopTimeoutMs);
    if ((await interrupt(turnId)) === "gone") {
      cancel();
      await abandon(turnId, { status: "interrupted" });
    }
  }

  function launch(hostTurn: HostTurn) {
    const id = hostTurn.turn.id;
    starting.set(id, hostTurn.turn.attempt);
    void start(hostTurn)
      .catch(() => needsAttention(refOf(hostTurn.turn), "failed", "The agent could not start."))
      .finally(() => {
        starting.delete(id);
        stopRequests.delete(id);
        if (newerAttempt.delete(id)) context.changed({});
      });
  }

  return {
    live,
    heldFolders,
    closeNative,
    unsynchronize() {
      synchronized = false;
    },
    startClaimed(turns: HostTurn[]) {
      for (const hostTurn of turns) {
        const id = hostTurn.turn.id;
        if (live.has(id) || starting.has(id) || ending.has(id)) continue;
        launch(hostTurn);
      }
    },
    async reconcile(turns: HostTurn[]) {
      const now = context.now();
      const byId = new Map(turns.map((entry) => [entry.turn.id, entry.turn]));
      const failed = () => context.log("Could not end an agent turn.");
      for (const state of live.values()) {
        const turn = byId.get(state.turnId);
        if (!turn || turn.attempt !== state.attempt) {
          state.released = true;
          void end([state.turnId], "moved", interruptAndCloseSessions).catch(failed);
        } else if (turn.status === "stopping")
          void requestStop(state.turnId, turn.interruption ?? "stop").catch(failed);
      }
      for (const hostTurn of turns) {
        const { turn } = hostTurn;
        if (live.has(turn.id) || ending.has(turn.id) || unreported.has(turn.id)) continue;
        const startingAttempt = starting.get(turn.id);
        if (startingAttempt !== undefined) {
          if (turn.status === "stopping") stopRequests.set(turn.id, turn.interruption ?? "stop");
          if (startingAttempt !== turn.attempt) newerAttempt.add(turn.id);
          continue;
        }
        const kept = waitUntil.get(turn.id);
        if (kept !== undefined && kept > now) continue;
        waitUntil.delete(turn.id);
        if (turn.status === "assigned" || kept !== undefined) launch(hostTurn);
        else {
          ending.add(turn.id);
          await recover(refOf(turn)).finally(() => ending.delete(turn.id));
          context.changed({ userAgentId: turn.userAgentId, turnId: turn.id });
        }
      }
    },
    async reportEnds() {
      for (const [turnId, { attempt, input }] of unreported)
        await reportEnd({ turnId, attempt }, input);
    },
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
    append,
    progress,
    flush,
    requestStop,
    end,
  };
}
export type TurnExecutor = ReturnType<typeof createTurnExecutor>;
