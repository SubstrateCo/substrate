import { AgentWorkStore } from "@substrate/client-storage/agent-work";
import {
  agentToolProvider,
  harnessConfiguration,
  turnContextSchema,
} from "@substrate/contracts/agent-tools";
import {
  liveTurnStatuses,
  sessionKeys,
  triggerRegistry,
  type AgentRequestDelivery,
  type AgentSessionKind,
  type AgentSourceMessage,
  type CloseRequestStatus,
  type InboxSourceRef,
  type TurnInterruption,
} from "@substrate/contracts/agent-work";
import type { HostItem, HostSession, HostTurn } from "@substrate/contracts/agent-work/control";
import type { AppSettings } from "@substrate/contracts/apps";
import {
  isHarnessErrorCode,
  type AdapterCapabilities,
  type HarnessCommand,
  type HarnessCommandResult,
  type HarnessErrorCode,
  type HarnessEvent,
  type HarnessEventBody,
  type TurnKind,
  type TurnResult,
} from "@substrate/contracts/harness-runtime";
import {
  createHarnessHost,
  type AdapterContext,
  type ConnectNative,
  type NativeAdapter,
  type RuntimeHarnessHost,
} from "@substrate/harness-runtime";

import type { AgentInbox, AgentWorkServer, CatalogAgent, HostApi, HostFinish } from "../ports.ts";
import { AgentWorkServerError } from "../server/agent-work-server.ts";
import { createAgentWorkRuntime } from "./runtime.ts";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const agentId = "00000000-0000-4000-8000-0000000000a1";
export const organizationId = "org-1";
export const permissionRequest = {
  sessionId: "native",
  toolCall: { toolCallId: "call-1", title: "ls", rawInput: { command: "ls" } },
  options: [
    { optionId: "allow", name: "Allow", kind: "allow_once" },
    { optionId: "deny", name: "Reject", kind: "reject_once" },
  ],
};

const noCapabilities: AdapterCapabilities = {
  steer: false,
  steerEvidence: false,
  compact: false,
  usage: false,
  noAskProfile: false,
  interruptReceipt: false,
};

export class CodeError extends Error {
  readonly code: HarnessErrorCode;
  constructor(code: HarnessErrorCode) {
    super(code);
    this.code = code;
  }
}

export type HostResult = Awaited<ReturnType<RuntimeHarnessHost["execute"]>>;

type HostCall = { method: keyof HostApi; turnId?: string; itemId?: string; body: unknown };

export function deferred<T = unknown>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

interface FixtureHooks {
  /**
   * Replaces the controller's result of a command. Return undefined to keep the default. next
   * sends the command to the host, so a hook can let the command reach the host and then fail.
   */
  command?: (
    command: HarnessCommand,
    next: () => Promise<HostResult>,
  ) => Promise<HostResult> | undefined;
  openRequest?: () => Promise<{ id: string; status: string }>;
}

interface FakeNative {
  context: AdapterContext;
  finish?: (result: TurnResult) => void;
}

interface ServerTurn extends HostTurn {
  leased: boolean;
  finished?: HostFinish;
}

const live = (turn: ServerTurn) => liveTurnStatuses.includes(turn.turn.status);

function placeOf(kind: AgentSessionKind, id: string) {
  if (kind === "dm") return { conversationId: id, threadId: null };
  if (kind === "thread") return { conversationId: crypto.randomUUID(), threadId: id };
  return null;
}

function attentionReason(turn: ServerTurn, unfinishedTool: boolean) {
  const unconfirmed = turn.items.some(
    (entry) => (entry.steered && entry.status === "submitted") || entry.status === "uncertain",
  );
  if (turn.turn.recoveries > 0 || !turn.turn.autoContinue) return "interrupted_again";
  if (unfinishedTool) return "unfinished_tool";
  if (unconfirmed) return "uncertain_input";
  return null;
}
const iso = (time: number) => new Date(time).toISOString();

function fakeControlPlane(clock: () => number) {
  const sessions = new Map<string, HostSession>();
  const turns = new Map<string, ServerTurn>();
  const claimQueue: string[] = [];
  const waiting: HostItem[] = [];
  const calls: HostCall[] = [];
  const outage = { host: false };
  const recoveryItems: { turnId: string; body: string }[] = [];

  function session(kind: AgentSessionKind, id: string, userAgentId = agentId): HostSession {
    const key = sessionKeys[kind](id);
    const existing = [...sessions.values()].find(
      (entry) => entry.key === key && entry.userAgentId === userAgentId,
    );
    if (existing) return existing;
    const created: HostSession = {
      id: crypto.randomUUID(),
      userAgentId,
      key,
      kind,
      status: "idle",
      parentSessionId: null,
      helperId: kind === "helper" ? id : null,
      origin: placeOf(kind, id),
      destination: null,
      resetGeneration: 0,
      resetReason: null,
    };
    sessions.set(created.id, created);
    return created;
  }

  function item(
    sessionId: string,
    sourceRef: InboxSourceRef,
    body: string | null = null,
  ): HostItem {
    return {
      id: crypto.randomUUID(),
      sessionId,
      source: sourceRef.source,
      sourceRef,
      body,
      lane: triggerRegistry[sourceRef.source].lane,
      status: "pending",
      steered: false,
      request: null,
      createdAt: iso(clock()),
    };
  }

  function queueTurn(input: {
    session: HostSession;
    items: HostItem[];
    kind?: TurnKind;
    handoff?: boolean;
  }) {
    const kind =
      input.kind ??
      (input.items.some((entry) => triggerRegistry[entry.source].turnMode === "interactive") &&
      input.session.kind !== "helper"
        ? "interactive"
        : "unattended");
    const id = crypto.randomUUID();
    const turn: ServerTurn = {
      turn: {
        id,
        userAgentId: input.session.userAgentId,
        sessionId: input.session.id,
        folderKey:
          input.session.kind === "helper" ? input.session.key : `main:${input.session.userAgentId}`,
        kind,
        status: "assigned",
        attempt: 1,
        generation: 1,
        handoff: input.handoff ?? false,
        interruption: null,
        recoveries: 0,
        autoContinue: true,
        resumesTurnId: null,
        leaseExpiresAt: null,
        createdAt: iso(clock()),
        startedAt: null,
      },
      session: input.session,
      items: input.items.map((entry) => ({ ...entry, status: "submitted" })),
      leased: false,
    };
    turns.set(id, turn);
    claimQueue.push(id);
    return turn;
  }

  function view(turn: ServerTurn): HostTurn {
    return structuredClone({
      turn: turn.turn,
      session: sessions.get(turn.session.id) ?? turn.session,
      items: turn.items.filter(
        (entry) => entry.status === "submitted" || entry.status === "uncertain",
      ),
    });
  }

  function reachable() {
    if (outage.host) throw new TypeError("fetch failed");
  }

  function held(turnId: string, attempt: number) {
    const turn = turns.get(turnId);
    const holds = turn?.leased === true && live(turn) && turn.turn.attempt === attempt;
    if (!turn || !holds)
      throw new AgentWorkServerError("CONFLICT", "This device no longer runs this turn.");
    return turn;
  }

  const neverStarted = (turn: ServerTurn) =>
    turn.turn.status === "assigned" && turn.turn.startedAt === null && turn.turn.attempt === 1;

  function requeue(turn: ServerTurn) {
    turn.turn.status = "cancelled";
    turn.leased = false;
    for (const entry of turn.items) if (!entry.steered) entry.status = "pending";
  }

  function receiveInline(turn: ServerTurn, requestIds: string[] = []) {
    const decided = waiting.filter(
      (entry) =>
        entry.sessionId === turn.turn.sessionId &&
        entry.sourceRef.source === "approval_result" &&
        requestIds.includes(entry.sourceRef.requestId),
    );
    for (const entry of decided) {
      entry.status = "consumed";
      waiting.splice(waiting.indexOf(entry), 1);
    }
  }

  function end(turn: ServerTurn, input: HostFinish) {
    receiveInline(turn, input.decidedRequestIds);
    const consumed = new Set(input.consumedItemIds ?? []);
    const queued = new Set(input.stillQueuedItemIds ?? []);
    const keep = input.status === "needs_attention";
    const settled: Record<"consumed" | "requeued" | "uncertain", string[]> = {
      consumed: [],
      requeued: [],
      uncertain: [],
    };
    for (const entry of turn.items) {
      if (entry.status !== "submitted") continue;
      if (!entry.steered) {
        if (!keep) settled.consumed.push(entry.id);
      } else if (consumed.has(entry.id)) settled.consumed.push(entry.id);
      else if (queued.has(entry.id)) settled.requeued.push(entry.id);
      else settled.uncertain.push(entry.id);
    }
    for (const entry of turn.items) {
      if (settled.consumed.includes(entry.id)) entry.status = "consumed";
      if (settled.uncertain.includes(entry.id)) entry.status = "uncertain";
      if (settled.requeued.includes(entry.id)) {
        entry.status = "pending";
        entry.steered = false;
        waiting.push(entry);
      }
    }
    turn.turn.status = settled.uncertain.length && !keep ? "needs_attention" : input.status;
    turn.turn.interruption = input.interruption ?? turn.turn.interruption;
    turn.leased = false;
    turn.finished = input;
    if (input.resume) recoveryItems.push({ turnId: turn.turn.id, body: input.resume });
    return { status: turn.turn.status, ...settled };
  }

  const api: HostApi = {
    async claim(_organization, busyFolders) {
      reachable();
      calls.push({ method: "claim", body: { busyFolders } });
      const claimed = claimQueue.splice(0).flatMap((id) => {
        const turn = turns.get(id)!;
        if (turn.turn.status !== "assigned") return [];
        if (busyFolders.includes(turn.turn.folderKey)) {
          claimQueue.push(id);
          return [];
        }
        turn.leased = true;
        return [view(turn)];
      });
      return claimed;
    },
    async sync() {
      reachable();
      calls.push({ method: "sync", body: null });
      return [...turns.values()].flatMap((turn) => (turn.leased && live(turn) ? [view(turn)] : []));
    },
    async start(_organization, turnId, input) {
      reachable();
      calls.push({ method: "start", turnId, body: input });
      const turn = held(turnId, input.attempt);
      for (const entry of turn.items)
        if (input.droppedItemIds.includes(entry.id)) entry.status = "dropped";
      if (turn.turn.status === "assigned" && turn.turn.attempt === 1) {
        if (!turn.items.some((entry) => entry.status === "submitted")) {
          turn.turn.status = "cancelled";
          turn.leased = false;
          return turn.turn.status;
        }
      }
      if (turn.turn.status === "assigned") {
        turn.turn.status = "running";
        turn.turn.startedAt ??= iso(clock());
      }
      return turn.turn.status;
    },
    async progress(_organization, turnId, input) {
      reachable();
      calls.push({ method: "progress", turnId, body: input });
      const turn = turns.get(turnId)!;
      receiveInline(turn, input.decidedRequestIds);
      for (const entry of turn.items)
        if (input.consumedItemIds?.includes(entry.id) && entry.status === "submitted")
          entry.status = "consumed";
      if (!turn.leased || !live(turn) || turn.turn.attempt !== input.attempt)
        return turn.turn.status;
      if (input.state === "waiting" && turn.turn.status === "running") turn.turn.status = "waiting";
      if (input.state === "running" && turn.turn.status === "waiting") turn.turn.status = "running";
      if (input.wrappedUp) turn.turn.autoContinue = false;
      return turn.turn.status;
    },
    async finish(_organization, turnId, input) {
      reachable();
      calls.push({ method: "finish", turnId, body: input });
      return end(held(turnId, input.attempt), input);
    },
    async retryLater(_organization, turnId, input) {
      reachable();
      calls.push({ method: "retryLater", turnId, body: input });
      const turn = held(turnId, input.attempt);
      if (!neverStarted(turn)) return "kept";
      requeue(turn);
      return "requeued";
    },
    async recover(_organization, turnId, input) {
      reachable();
      calls.push({ method: "recover", turnId, body: input });
      const turn = held(turnId, input.attempt);
      if (neverStarted(turn)) {
        requeue(turn);
        return { action: "requeued" };
      }
      if (turn.turn.status === "stopping" || turn.turn.handoff) {
        const action =
          turn.turn.status === "stopping" && turn.turn.interruption === "stop"
            ? "cancelled"
            : "interrupted";
        end(turn, { attempt: input.attempt, status: action });
        return { action };
      }
      const reason = attentionReason(turn, input.unfinishedTool);
      if (reason) {
        turn.turn.status = "needs_attention";
        turn.leased = false;
        return { action: "needs_attention", reason };
      }
      turn.turn.status = "assigned";
      turn.turn.attempt += 1;
      turn.turn.generation += 1;
      turn.turn.recoveries += 1;
      turn.turn.interruption = "app";
      return { action: "continue" };
    },
    async steer(_organization, turnId, input) {
      reachable();
      calls.push({ method: "steer", turnId, body: input });
      const turn = held(turnId, input.attempt);
      const folder = waiting.filter((entry) => {
        const owner = sessions.get(entry.sessionId);
        const key = owner?.kind === "helper" ? owner.key : `main:${owner?.userAgentId}`;
        return entry.status === "pending" && key === turn.turn.folderKey;
      });
      const steered: HostItem[] = [];
      for (const entry of folder) {
        const ref = entry.sourceRef;
        const joins =
          triggerRegistry[entry.source].steerable &&
          entry.sessionId === turn.turn.sessionId &&
          turn.turn.kind === "interactive" &&
          input.harnessCanSteer &&
          !turn.turn.handoff &&
          turn.turn.status !== "stopping" &&
          !(ref.source === "approval_result" && input.awaitingRequestIds.includes(ref.requestId));
        if (!joins) continue;
        entry.status = "submitted";
        entry.steered = true;
        waiting.splice(waiting.indexOf(entry), 1);
        turn.items.push(entry);
        steered.push(structuredClone(entry));
      }
      return {
        items: steered,
        waiting: folder.some((entry) => !steered.some((other) => other.id === entry.id)),
      };
    },
    async steerResult(_organization, itemId, input) {
      reachable();
      calls.push({ method: "steerResult", itemId, turnId: input.turnId, body: input });
      const turn = turns.get(input.turnId)!;
      const entry = turn.items.find((candidate) => candidate.id === itemId)!;
      if (input.result === "undelivered") {
        turn.items.splice(turn.items.indexOf(entry), 1);
        entry.status = "pending";
        entry.steered = false;
        waiting.push(entry);
      } else if (input.result === "uncertain") entry.status = "uncertain";
      else if (input.result === "inaccessible") entry.status = "dropped";
    },
    async submitEpoch(_organization, input) {
      reachable();
      calls.push({ method: "submitEpoch", body: input });
      const owner = sessions.get(input.sessionId)!;
      queueTurn({
        session: owner,
        items: [item(owner.id, { source: "epoch", fromEpoch: input.fromEpoch }, input.body)],
        kind: "unattended",
        handoff: true,
      });
      return true;
    },
  };

  return {
    api,
    sessions,
    turns,
    waiting,
    calls,
    outage,
    recoveryItems,
    session,
    item,
    queueTurn,
    /** The owner stops the turn, or sends a waiting item now. */
    stop(turnId: string, interruption: TurnInterruption = "stop") {
      const turn = turns.get(turnId)!;
      turn.turn.status = "stopping";
      turn.turn.interruption = interruption;
    },
    /** The server ended the lease, as when the agent moved to another device. */
    release(turnId: string) {
      const turn = turns.get(turnId)!;
      turn.leased = false;
      turn.turn.status = "interrupted";
      turn.turn.interruption = "moved";
    },
    reset(sessionId: string, reason: "new_topic" | "start_fresh" = "start_fresh") {
      const owner = sessions.get(sessionId)!;
      owner.resetGeneration += 1;
      owner.resetReason = reason;
    },
    /** The owner retries a turn that needs attention: it runs again as its next attempt. */
    retry(turnId: string) {
      const turn = turns.get(turnId)!;
      turn.turn.status = "assigned";
      turn.turn.attempt += 1;
      turn.turn.generation += 1;
      turn.leased = true;
    },
  };
}

function workerSessionView() {
  type Entry = { org: string; confirmed: boolean; live?: { turnId: string; generation: number } };
  const entries = new Map<string, Entry>();
  return {
    opening(command: Extract<HarnessCommand, { type: "open" }>) {
      if (entries.has(command.sessionId)) return;
      entries.set(command.sessionId, { org: command.organizationId, confirmed: false });
    },
    opened(sessionId: string) {
      const entry = entries.get(sessionId);
      if (entry) entry.confirmed = true;
    },
    openFailed(sessionId: string) {
      if (entries.get(sessionId)?.confirmed === false) entries.delete(sessionId);
    },
    observe(event: HarnessEvent) {
      if (event.type === "session.closed") {
        entries.delete(event.sessionId);
        return;
      }
      const entry = entries.get(event.sessionId);
      if (entry && event.type === "turn.started" && event.turnId !== null)
        entry.live = { turnId: event.turnId, generation: event.generation ?? 0 };
      if (entry && event.type === "turn.completed" && entry.live?.turnId === event.turnId)
        entry.live = undefined;
    },
    exited(): HarnessEvent[] {
      const closed: HarnessEvent[] = [];
      for (const [sessionId, entry] of entries)
        closed.push({
          type: "session.closed",
          reason: "worker_exited",
          sessionId,
          organizationId: entry.org,
          turnId: entry.live?.turnId ?? null,
          generation: entry.live?.generation ?? null,
          timestamp: Date.now(),
        });
      entries.clear();
      return closed;
    },
  };
}

/**
 * A runtime on a real SQLite store and the real harness host, with a fake server control plane,
 * a fake native adapter and a manual clock. A thin controller in between checks the
 * organization and reports host failures by code, as the worker and controller do. Reuse a
 * store path to simulate an app restart.
 */
export async function runtimeFixture(
  options: {
    path?: string;
    capabilities?: Partial<AdapterCapabilities>;
    /** Every native connect fails, as when the native session is gone. */
    failOpen?: boolean;
    now?: number;
    agents?: CatalogAgent[];
    inbox?: AgentInbox;
  } = {},
) {
  const path = options.path ?? ":memory:";
  const store = await AgentWorkStore.open(path);
  await mkdir(join(tmpdir(), "opencode"), { recursive: true });
  const accountDirectory = await mkdtemp(join(tmpdir(), "opencode", "agent-work-host-"));
  let now = options.now ?? Date.parse("2026-06-01T10:00:00Z");
  const apps: AppSettings = { organizationId, enabledApps: ["messages", "agents"] };
  if (options.inbox) apps.enabledApps.push("inbox");
  const messages = new Map<string, AgentSourceMessage>();
  const control = fakeControlPlane(() => now);
  const requestPosts: { method: string; body: unknown }[] = [];
  let answers: AgentRequestDelivery[] = [];
  const commands: HarnessCommand[] = [];
  const stillQueued: string[] = [];
  const capabilities = { ...noCapabilities, ...options.capabilities };
  const timers: { at: number; callback: () => void; cleared: boolean }[] = [];
  const intervals = new Map<number, () => void>();
  const catalog: CatalogAgent[] = options.agents ?? [
    { id: agentId, name: "Scout", harness: "claude", enabled: true, disabledApps: [], home: true },
  ];
  const outage = { sources: false, openRequest: false, catalogLookup: false };
  const hooks: FixtureHooks = {};
  const closedRequests: CloseRequestStatus[] = [];
  const harness = { activeOrganizationId: organizationId };
  const closedOrganizations: string[] = [];
  const synchronizations = { count: 0 };

  const server: AgentWorkServer = {
    register: async (body) => void requestPosts.push({ method: "register", body }),
    heartbeat: async () => void requestPosts.push({ method: "heartbeat", body: null }),
    catalog: async () => catalog.map((agent) => ({ ...agent })),
    async sources(_organization, ids) {
      if (outage.sources) throw new TypeError("fetch failed");
      return {
        messages: ids.flatMap((id) => (messages.has(id) ? [messages.get(id)!] : [])),
        inaccessible: ids.filter((id) => !messages.has(id)),
      };
    },
    threadMessages: async () => [],
    async openRequest(body) {
      requestPosts.push({ method: "openRequest", body });
      if (outage.openRequest) throw new TypeError("fetch failed");
      if (hooks.openRequest) return hooks.openRequest();
      return { id: crypto.randomUUID(), status: "pending" };
    },
    async closeRequest(_organization, requestId, status) {
      requestPosts.push({ method: "closeRequest", body: { requestId, status } });
      closedRequests.push(status);
    },
    async requestAnswers() {
      const result = answers;
      answers = [];
      return result;
    },
    requestStatus: async () => ({ status: "pending", outcome: null }),
  };

  function later(callback: () => void, milliseconds: number) {
    const timer = { at: now + milliseconds, callback, cleared: false };
    timers.push(timer);
    return () => {
      timer.cleared = true;
    };
  }

  const natives = new Map<string, FakeNative>();
  const open = new Map<string, FakeNative>();
  let nativeCount = 0;
  const connect: ConnectNative = async (_harness, context, _prefix, resumeId) => {
    if (options.failOpen) throw new Error("The native session is gone.");
    const native: FakeNative = { context };
    const adapter: NativeAdapter = {
      capabilities: { ...capabilities },
      nativeSessionId: resumeId ?? `native-${++nativeCount}`,
      turn: () =>
        new Promise((resolve) => {
          native.finish = resolve;
        }),
      steer: async () => {},
      compact: async () => {},
      interrupt: async () => ({ stillQueuedInputIds: [...stillQueued] }),
      respond: async () => {},
      disconnect: async () =>
        native.finish?.({ status: "failed", error: "The native session closed." }),
    };
    natives.set(adapter.nativeSessionId, native);
    return adapter;
  };

  const workerSessions = workerSessionView();
  let host: RuntimeHarnessHost;
  let unsubscribe = () => {};

  function deliver(event: HarnessEvent) {
    workerSessions.observe(event);
    if (event.type === "session.closed") open.delete(event.sessionId);
    runtime.onHarnessEvent(event);
  }

  async function startHost() {
    host = await createHarnessHost({
      accountDirectory,
      connect,
      clock: { now: () => now, later },
      tools: agentToolProvider({ local: (request) => runtime.handleLocalTool(request) }),
    });
    unsubscribe = host.subscribe(deliver);
    await host.configure(
      harnessConfiguration({
        organizationId,
        enabledApps: apps.enabledApps,
        agents: catalog.map((agent) => ({
          id: agent.id,
          name: agent.name,
          instructions: "",
          harness: agent.harness,
          enabled: agent.enabled,
          disabledApps: agent.disabledApps,
          substrateGuide: Boolean(options.inbox),
        })),
      }),
    );
  }

  async function workerExited() {
    unsubscribe();
    const closed = workerSessions.exited();
    open.clear();
    await host.dispose();
    await startHost();
    for (const event of closed) deliver({ ...event, timestamp: now });
  }

  const inflight = new Set<Promise<HostResult>>();
  function hostCommand(command: HarnessCommand): Promise<HostResult> {
    const pending = sendToHost(command);
    const tracked = pending.catch(() => {});
    inflight.add(tracked);
    void tracked.finally(() => inflight.delete(tracked));
    return pending;
  }

  async function sendToHost(command: HarnessCommand): Promise<HostResult> {
    try {
      if (command.type !== "open") return await host.execute(command);
      workerSessions.opening(command);
      try {
        const ref = await host.execute(command);
        workerSessions.opened(command.sessionId);
        open.set(command.sessionId, natives.get(ref.nativeSessionId)!);
        return ref;
      } catch (error) {
        workerSessions.openFailed(command.sessionId);
        throw error;
      }
    } catch (error) {
      const code = error instanceof Error && "code" in error ? error.code : undefined;
      throw new CodeError(isHarnessErrorCode(code) ? code : "harness-error");
    }
  }

  function createRuntime() {
    return createAgentWorkRuntime(
      {
        organizationId,
        store,
        server,
        host: control.api,
        harness: {
          synchronize: async () => {
            synchronizations.count++;
          },
          async execute<C extends HarnessCommand>(command: C) {
            commands.push(command);
            if (command.organizationId !== harness.activeOrganizationId)
              throw new CodeError("organization-unavailable");
            const hooked = hooks.command?.(command, () => hostCommand(command));
            // SAFETY: the host returns the result shape of each command, as the controller does.
            return (await (hooked ?? hostCommand(command))) as HarnessCommandResult<C>;
          },
          async closeOrganization(organization) {
            closedOrganizations.push(organization);
            await host.closeOrganization(organization);
          },
        },
        agents: {
          all: () => server.catalog(),
          async get(id) {
            if (outage.catalogLookup) throw new TypeError("fetch failed");
            return (await server.catalog()).find((agent) => agent.id === id);
          },
          invalidate: () => {},
        },
        enabledApps: async () => apps.enabledApps,
        inbox: options.inbox,
        now: () => now,
        log: () => {},
      },
      {
        device: { name: "Laptop", platform: "win32" },
        notify: () => {},
        every(callback, milliseconds) {
          intervals.set(milliseconds, callback);
          return () => intervals.delete(milliseconds);
        },
        later,
      },
    );
  }
  let runtime = createRuntime();
  await startHost();

  async function settle() {
    for (let round = 0; round < 20; round++) {
      for (let index = 0; index < 40; index++)
        await new Promise((resolve) => setImmediate(resolve));
      if (!inflight.size) return;
      await Promise.all(inflight);
    }
  }

  async function advance(milliseconds: number) {
    now += milliseconds;
    for (const timer of timers.filter((entry) => entry.at <= now && !entry.cleared)) {
      timer.cleared = true;
      timer.callback();
    }
    await settle();
  }

  interface OwnerMessageInput {
    userAgentId?: string;
    conversationId?: string;
    threadId?: string;
    body?: string;
    visible?: boolean;
  }

  function ownerItem(input: OwnerMessageInput = {}) {
    const messageId = crypto.randomUUID();
    const conversationId = input.conversationId ?? crypto.randomUUID();
    const owner = input.threadId
      ? control.session("thread", input.threadId, input.userAgentId)
      : control.session("dm", conversationId, input.userAgentId);
    if (input.threadId && owner.origin) owner.origin.conversationId = conversationId;
    if (input.visible !== false)
      messages.set(messageId, {
        id: messageId,
        conversationId,
        threadId: input.threadId ?? null,
        conversationName: "Owner",
        conversationKind: input.threadId ? "channel" : "dm",
        author: { actorId: "owner-actor", name: "Owner", kind: "owner" },
        body: input.body ?? "Hello",
        createdAt: iso(now),
      });
    const entry = control.item(owner.id, {
      source: "owner_message",
      messageId,
      conversationId,
      threadId: input.threadId ?? null,
    });
    return { item: entry, session: owner, messageId, conversationId };
  }

  function turnCommand(turnId: string) {
    const matching = commands.filter(
      (command): command is Extract<HarnessCommand, { type: "turn" }> =>
        command.type === "turn" && command.turnId === turnId,
    );
    return matching.at(-1)!;
  }

  return {
    store,
    apps,
    get runtime() {
      return runtime;
    },
    control,
    /**
     * The app quits and starts again: the harness worker and the runtime are new, while the
     * server and the local store keep their data. Native sessions can still resume.
     */
    async restart() {
      await settle();
      runtime.dispose();
      unsubscribe();
      workerSessions.exited();
      open.clear();
      await host.dispose();
      runtime = createRuntime();
      await startHost();
      await runtime.start();
      await settle();
    },
    /** The controller verified another organization: commands for this one fail. */
    switchOrganization(id: string) {
      harness.activeOrganizationId = id;
    },
    nativeSessions: () => [...open.keys()],
    toolEndpoint: (sessionId: string) => open.get(sessionId)?.context.lease?.endpoint,
    synchronizations,
    async tick() {
      intervals.get(30_000)?.();
      await settle();
    },
    async heartbeat() {
      intervals.get(60_000)?.();
      await settle();
    },
    closedOrganizations,
    requestPosts,
    /** The statuses of the server requests the host closed, in order. */
    closedRequests,
    commands,
    stillQueued,
    catalog,
    outage,
    hooks,
    settle,
    path,
    now: () => now,
    /** Moves the clock and runs due timers. */
    advance,
    ownerItem,
    revokeMessage: (id: string) => messages.delete(id),
    answer(delivery: AgentRequestDelivery) {
      answers.push(delivery);
    },
    /** Turn commands, with the server turn context the host bound to each. */
    turns: () =>
      commands.flatMap((command) =>
        command.type === "turn"
          ? [{ ...command, context: turnContextSchema.parse(command.context) }]
          : [],
      ),
    turnCommand,
    hostCalls: <M extends keyof HostApi>(method: M) =>
      control.calls.filter((call) => call.method === method),
    finished: (turnId: string) => control.turns.get(turnId)?.finished,
    status: (turnId: string) => control.turns.get(turnId)?.turn.status,
    /**
     * The native harness reports an event of the turn's session through the host. The host sends
     * turn.started itself when the turn command arrives. turn.completed ends the native turn, and
     * session.closed is the worker's exit.
     */
    async emit(turnId: string, body: HarnessEventBody) {
      const native = open.get(turnCommand(turnId).sessionId);
      if (body.type === "session.closed") await workerExited();
      else if (body.type === "turn.completed") native?.finish?.(body.result);
      else if (body.type !== "turn.started") native?.context.emit(body);
      await settle();
    },
    /** Native output outside our turns, such as a turn the harness started itself. */
    async nativeOutput(sessionId: string, body: HarnessEventBody) {
      open.get(sessionId)?.context.emit(body, "session");
      await settle();
    },
    /** The server admitted an owner message and the host claims its turn after a hint. */
    async message(input: OwnerMessageInput = {}) {
      const sent = ownerItem(input);
      const turn = control.queueTurn({ session: sent.session, items: [sent.item] });
      await runtime.sync();
      await settle();
      return { ...sent, turnId: turn.turn.id, sessionId: sent.session.id };
    },
    /** A realtime agent-work hint, after the hint window. */
    async hint() {
      runtime.hint();
      await advance(300);
    },
    async close() {
      await settle();
      unsubscribe();
      runtime.dispose();
      await host.dispose().catch(() => {});
      store.close();
      await rm(accountDirectory, { recursive: true, force: true });
    },
  };
}
