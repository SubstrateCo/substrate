import { AgentWorkStore } from "@substrate/client-storage/agent-work";
import type {
  AgentRequestDelivery,
  AgentSourceMessage,
  AgentWakeRequestDetail,
  AgentWakeView,
} from "@substrate/contracts/agent-work";
import type {
  AdapterCapabilities,
  HarnessCommand,
  HarnessCommandResult,
  HarnessEvent,
  HarnessEventBody,
} from "@substrate/contracts/harness";

import type { AgentWorkServer, CatalogAgent } from "../server/agent-work-server.ts";
import { createAgentWorkRuntime } from "./runtime.ts";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/* oxlint-disable deslop/no-unknown-parameters, deslop/no-unknown-returns -- The fake server records untyped request bodies and the fake harness returns untyped results, as the real boundaries do. */

export const agentId = "00000000-0000-4000-8000-0000000000a1";
export const organizationId = "org-1";
export const installationId = "00000000-0000-4000-8000-0000000000d1";

const noCapabilities: AdapterCapabilities = {
  steer: false,
  steerEvidence: false,
  compact: false,
  usage: false,
  noAskProfile: false,
  interruptReceipt: false,
};

/** A harness or server failure with a fixed code, as the controller reports them. */
export class CodeError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

export async function openStore() {
  await mkdir(join(tmpdir(), "opencode"), { recursive: true });
  const root = await mkdtemp(join(tmpdir(), "opencode", "agent-work-runtime-"));
  return {
    path: join(root, "agent-work.sqlite"),
    remove: () => rm(root, { recursive: true, force: true }),
  };
}

/** Test overrides of the fake harness and server. */
interface FixtureHooks {
  /**
   * Replaces the fake harness result of a command. Return undefined to keep the default. next
   * runs the default host behavior, so a hook can let the command reach the host and then fail.
   */
  command?: (command: HarnessCommand, next: () => Promise<unknown>) => Promise<unknown> | undefined;
  openRequest?: () => Promise<{ id: string; status: string }>;
}

/** The host's grace after an interrupt before it ends the turn itself. */
const hostInterruptGraceMs = 15_000;

interface FakeNativeSession {
  organizationId: string;
  epoch: number;
  nativeSessionId: string;
  resumed: boolean;
  turn?: { turnId: string; generation: number; clearGrace?: () => void };
  /** The session closes as soon as its live turn ends. */
  closing: boolean;
}

/** A promise that the test settles. */
export function deferred<T = unknown>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

/**
 * A runtime on a real SQLite store with a fake server, a fake harness and a manual clock.
 * Reuse a store path to simulate an app restart.
 */
export async function runtimeFixture(
  options: {
    path?: string;
    capabilities?: Partial<AdapterCapabilities>;
    /** Every open fails with resume-failed. */
    failOpen?: boolean;
    now?: number;
  } = {},
) {
  // A restart reuses the given file. Other tests need no file.
  const path = options.path ?? ":memory:";
  const store = await AgentWorkStore.open(path);
  let now = options.now ?? Date.parse("2026-06-01T10:00:00Z");
  const wakes: AgentWakeView[] = [];
  const acked = new Set<string>();
  const messages = new Map<string, AgentSourceMessage>();
  const posts: { method: string; body: unknown }[] = [];
  let answers: AgentRequestDelivery[] = [];
  /** Requests the server lists as open in needs-you. */
  const serverOpenRequests = new Set<string>();
  const commands: HarnessCommand[] = [];
  const stillQueued: string[] = [];
  const capabilities = { ...noCapabilities, ...options.capabilities };
  const timers: { at: number; callback: () => void; cleared: boolean }[] = [];
  const catalog: CatalogAgent[] = [
    { id: agentId, name: "Scout", harness: "claude", enabled: true, home: true },
  ];
  /** catalogLookup: reading one agent from the catalog fails, as when its cache expired offline. */
  const outage = { sources: false, openRequest: false, catalogLookup: false };
  const hooks: FixtureHooks = {};
  /** The organization the controller verified. Commands for another one fail. */
  const harness = { activeOrganizationId: organizationId };
  /** The sessions open in the fake host. */
  const native = new Map<string, FakeNativeSession>();
  const closedOrganizations: string[] = [];
  /** The realtime connection main reports to agent work. */
  const realtime = { connected: false };
  /** How often the runtime wrote agent folders through the controller. */
  const synchronizations = { count: 0 };
  /** The runtime's periodic tick, run by the test. */
  let tick = () => {};
  const record = (method: string, body: unknown) => {
    posts.push({ method, body });
  };

  const server: AgentWorkServer = {
    register: async (body) => record("register", body),
    heartbeat: async () => record("heartbeat", null),
    catalog: async () => catalog.map((agent) => ({ ...agent })),
    async pullWakes(_organization, limit) {
      record("pullWakes", { limit });
      return wakes.filter((wake) => !acked.has(wake.id)).slice(0, limit);
    },
    ackWakes: async (_organization, ids) => {
      for (const id of ids) acked.add(id);
    },
    async sources(_organization, ids) {
      if (outage.sources) throw new TypeError("fetch failed");
      return {
        messages: ids.flatMap((id) => (messages.has(id) ? [messages.get(id)!] : [])),
        inaccessible: ids.filter((id) => !messages.has(id)),
      };
    },
    publishStatus: async (body) => record("status", body),
    async openRequest(body) {
      record("openRequest", body);
      if (outage.openRequest) throw new TypeError("fetch failed");
      if (hooks.openRequest) return hooks.openRequest();
      return { id: crypto.randomUUID(), status: "pending" };
    },
    closeRequest: async (_organization, requestId, status) =>
      record("closeRequest", { requestId, status }),
    async requestAnswers() {
      record("requestAnswers", null);
      const result = answers;
      answers = [];
      return result;
    },
    directConversation: async () => crypto.randomUUID(),
    async openRequestIds() {
      record("openRequestIds", null);
      return [...serverOpenRequests];
    },
  };

  function later(callback: () => void, milliseconds: number) {
    const timer = { at: now + milliseconds, callback, cleared: false };
    timers.push(timer);
    return () => {
      timer.cleared = true;
    };
  }

  // The fake host follows the real host and controller: events reach agent work in order, a
  // closed session ends its live turn as failed first, and interrupts end within the grace.
  function deliver(event: HarnessEvent) {
    const session = native.get(event.sessionId);
    if (event.type === "session.closed") native.delete(event.sessionId);
    const ends =
      event.type === "turn.completed" && session?.turn && session.turn.turnId === event.turnId;
    if (ends) {
      session.turn!.clearGrace?.();
      session.turn = undefined;
    }
    runtime.onHarnessEvent(event);
    if (ends && session.closing) closeNativeSession(event.sessionId);
  }

  function hostEvent(
    sessionId: string,
    body: HarnessEventBody,
    turn?: { turnId: string; generation: number },
  ) {
    deliver({
      sessionId,
      organizationId: native.get(sessionId)?.organizationId ?? organizationId,
      turnId: turn?.turnId ?? null,
      generation: turn?.generation ?? null,
      timestamp: now,
      ...body,
    });
  }

  /** The adapter ends a live turn as failed on disconnect, before the session closes. */
  function closeNativeSession(sessionId: string) {
    const session = native.get(sessionId);
    if (!session) return;
    if (session.turn)
      hostEvent(
        sessionId,
        {
          type: "turn.completed",
          result: { status: "failed", error: "The native session closed." },
        },
        session.turn,
      );
    hostEvent(sessionId, { type: "session.closed", reason: "closed" });
  }

  function openSession(command: { organizationId: string; sessionId: string }) {
    const session = native.get(command.sessionId);
    if (!session || session.organizationId !== command.organizationId)
      throw new CodeError("not-connected");
    return session;
  }

  async function hostCommand(command: HarnessCommand): Promise<unknown> {
    switch (command.type) {
      case "open": {
        if (options.failOpen) throw new CodeError("resume-failed");
        const existing = native.get(command.sessionId);
        if (existing) {
          const stale =
            existing.epoch !== command.epoch ||
            (command.nativeSessionId !== undefined &&
              command.nativeSessionId !== existing.nativeSessionId);
          if (!stale && !existing.closing)
            return {
              nativeSessionId: existing.nativeSessionId,
              capabilities,
              resumed: existing.resumed,
            };
          if (!stale && existing.turn) throw new CodeError("turn-active");
          closeNativeSession(command.sessionId);
        }
        const opened: FakeNativeSession = {
          organizationId: command.organizationId,
          epoch: command.epoch,
          nativeSessionId: command.nativeSessionId ?? `native-${command.sessionId}`,
          resumed: Boolean(command.nativeSessionId),
          closing: false,
        };
        native.set(command.sessionId, opened);
        return {
          nativeSessionId: opened.nativeSessionId,
          capabilities,
          resumed: opened.resumed,
        };
      }
      case "turn": {
        const session = openSession(command);
        if (session.turn) throw new CodeError("turn-active");
        if (session.closing) throw new CodeError("not-connected");
        session.turn = { turnId: command.turnId, generation: command.generation };
        return undefined;
      }
      case "steer": {
        const session = openSession(command);
        if (session.turn?.turnId !== command.turnId) throw new CodeError("turn-not-live");
        if (!capabilities.steer) throw new CodeError("steer-unsupported");
        return undefined;
      }
      case "interrupt": {
        const session = native.get(command.sessionId);
        const turn = session?.turn;
        if (!session || session.organizationId !== command.organizationId || !turn)
          throw new CodeError("no-live-turn");
        if (turn.turnId !== command.turnId) throw new CodeError("no-live-turn");
        turn.clearGrace ??= later(() => {
          if (session.turn !== turn) return;
          session.closing = true;
          hostEvent(
            command.sessionId,
            {
              type: "turn.completed",
              result: {
                status: "interrupted",
                error: "The harness did not confirm the interrupt.",
              },
            },
            turn,
          );
        }, hostInterruptGraceMs);
        return { stillQueuedInputIds: [...stillQueued] };
      }
      case "respond":
        openSession(command);
        return undefined;
      case "compact":
        if (openSession(command).turn) throw new CodeError("turn-active");
        return undefined;
      case "close": {
        const session = native.get(command.sessionId);
        if (session?.organizationId === command.organizationId)
          closeNativeSession(command.sessionId);
        return undefined;
      }
    }
  }

  function createRuntime() {
    return createAgentWorkRuntime(
      {
        organizationId,
        installationId,
        store,
        server,
        harness: {
          synchronize: async () => {
            synchronizations.count++;
          },
          async execute<C extends HarnessCommand>(command: C) {
            commands.push(command);
            if (command.organizationId !== harness.activeOrganizationId)
              throw new CodeError("organization-unavailable");
            const hooked = hooks.command?.(command, () => hostCommand(command));
            // SAFETY: the fake host returns the result shape of each command, as the controller does.
            return (await (hooked ?? hostCommand(command))) as HarnessCommandResult<C>;
          },
          async closeOrganization(organization) {
            closedOrganizations.push(organization);
            for (const [sessionId, session] of native)
              if (session.organizationId === organization) closeNativeSession(sessionId);
          },
          readProfile: async () => "",
        },
        agents: {
          all: () => server.catalog(),
          async get(id) {
            if (outage.catalogLookup) throw new TypeError("fetch failed");
            return (await server.catalog()).find((agent) => agent.id === id);
          },
          invalidate: () => {},
        },
        profile: async () => "",
        now: () => now,
        log: () => {},
      },
      {
        device: { name: "Laptop", platform: "win32" },
        notify: () => {},
        realtimeConnected: () => realtime.connected,
        every(callback) {
          tick = callback;
          return () => {
            tick = () => {};
          };
        },
        later,
      },
    );
  }
  let runtime = createRuntime();

  async function settle() {
    for (let index = 0; index < 40; index++) await new Promise((resolve) => setImmediate(resolve));
  }

  interface OwnerMessageInput {
    conversationId?: string;
    threadId?: string;
    body?: string;
    visible?: boolean;
  }

  /** An owner message wake. Pass a thread root ID for a thread session. */
  function ownerMessage(input: OwnerMessageInput = {}) {
    const id = crypto.randomUUID();
    const conversationId = input.conversationId ?? crypto.randomUUID();
    if (input.visible !== false)
      messages.set(id, {
        id,
        conversationId,
        threadId: input.threadId ?? null,
        conversationName: "Owner",
        conversationKind: input.threadId ? "channel" : "dm",
        author: { actorId: "owner-actor", name: "Owner", kind: "owner" },
        body: input.body ?? "Hello",
        createdAt: new Date(now).toISOString(),
      });
    wakes.push({
      id: crypto.randomUUID(),
      userAgentId: agentId,
      source: "owner_message",
      sourceRef: {
        messageId: id,
        conversationId,
        threadId: input.threadId ?? null,
        kind: input.threadId ? "thread_reply" : "direct_message",
      },
      sessionKey: input.threadId ? `thread:${input.threadId}` : `dm:${conversationId}`,
      dedupeKey: `msg:${id}`,
      createdAt: new Date(now).toISOString(),
      request: null,
    });
    return { messageId: id, conversationId };
  }

  async function advance(milliseconds: number) {
    now += milliseconds;
    for (const timer of timers.filter((entry) => entry.at <= now && !entry.cleared)) {
      timer.cleared = true;
      timer.callback();
    }
    await settle();
  }

  /** The latest turn command for the turn: a continued turn has a new generation. */
  function turnCommand(turnId: string) {
    const matching = commands.filter(
      (command): command is Extract<HarnessCommand, { type: "turn" }> =>
        command.type === "turn" && command.turnId === turnId,
    );
    return matching.at(-1)!;
  }

  return {
    store,
    get runtime() {
      return runtime;
    },
    /** A new runtime on the same store and harness, as when its organization is active again. */
    async restart() {
      runtime.dispose();
      runtime = createRuntime();
      await runtime.start();
      await settle();
    },
    /** The controller verified another organization: commands for this one fail. */
    switchOrganization(id: string) {
      harness.activeOrganizationId = id;
    },
    /** Sessions open in the fake host. */
    nativeSessions: () => [...native.keys()],
    realtime,
    synchronizations,
    /** Runs the runtime's periodic tick once. */
    async tick() {
      tick();
      await settle();
    },
    closedOrganizations,
    posts,
    commands,
    stillQueued,
    serverOpenRequests,
    catalog,
    outage,
    hooks,
    acked,
    wakes,
    settle,
    path,
    now: () => now,
    /** Moves the clock and runs due timers. */
    advance,
    ownerMessage,
    /** An answer wake with the decided request, as the server reports it. */
    answerWake(request: AgentWakeRequestDetail, sessionKey: string) {
      wakes.push({
        id: crypto.randomUUID(),
        userAgentId: agentId,
        source: "answer",
        sourceRef: { requestId: request.id },
        sessionKey,
        dedupeKey: `answer:${request.id}`,
        createdAt: new Date(now).toISOString(),
        request,
      });
    },
    answer(delivery: AgentRequestDelivery) {
      answers.push(delivery);
    },
    turns: () => commands.filter((command) => command.type === "turn"),
    /** Emits a harness event for a turn this runtime started. */
    async emit(turnId: string, body: HarnessEventBody) {
      const turn = turnCommand(turnId);
      deliver({
        sessionId: turn.sessionId,
        organizationId,
        turnId,
        generation: turn.generation,
        timestamp: now,
        ...body,
      });
      await settle();
    },
    /** Emits an event for a turn command from inside a hook, before the command answers. */
    emitFor(command: Extract<HarnessCommand, { type: "turn" }>, body: HarnessEventBody) {
      hostEvent(command.sessionId, body, command);
    },
    /** Emits any harness event, such as native output outside our turns. */
    async event(
      event: HarnessEventBody & Pick<HarnessEvent, "sessionId" | "turnId" | "generation">,
    ) {
      deliver({ organizationId, timestamp: now, ...event });
      await settle();
    },
    /** Sends an owner message and lets its debounced turn start. */
    async message(input: OwnerMessageInput = {}) {
      const sent = ownerMessage(input);
      await runtime.sync();
      await advance(600);
      return sent;
    },
    async close() {
      runtime.dispose();
      store.close();
    },
  };
}
export type RuntimeFixture = Awaited<ReturnType<typeof runtimeFixture>>;
