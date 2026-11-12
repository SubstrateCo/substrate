import { AgentWorkStore } from "@substrate/client-storage/agent-work";
import {
  sessionKeys,
  type AgentRequestDelivery,
  type AgentSourceMessage,
  type AgentWakeRequestDetail,
  type AgentWakeView,
} from "@substrate/contracts/agent-work";
import {
  isHarnessErrorCode,
  type AdapterCapabilities,
  type HarnessCommand,
  type HarnessCommandResult,
  type HarnessErrorCode,
  type HarnessEvent,
  type HarnessEventBody,
  type TurnResult,
} from "@substrate/contracts/harness";
import {
  createHarnessHost,
  type AdapterContext,
  type ConnectNative,
  type NativeAdapter,
  type RuntimeHarnessHost,
} from "@substrate/harness-runtime";

import { createOpenSessions } from "../../harness/worker/open-sessions.ts";
import type { AgentWorkServer, CatalogAgent } from "../server/agent-work-server.ts";
import { createAgentWorkRuntime } from "./runtime.ts";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/* oxlint-disable deslop/no-unknown-parameters, deslop/no-unknown-returns -- The fake server records untyped request bodies and hooks return untyped results, as the real boundaries do. */

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

/** A harness failure with a fixed code, as the controller reports them. */
export class CodeError extends Error {
  readonly code: HarnessErrorCode;
  constructor(code: HarnessErrorCode) {
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

/** Test overrides of the controller and server. */
interface FixtureHooks {
  /**
   * Replaces the controller's result of a command. Return undefined to keep the default. next
   * sends the command to the host, so a hook can let the command reach the host and then fail.
   */
  command?: (command: HarnessCommand, next: () => Promise<unknown>) => Promise<unknown> | undefined;
  openRequest?: () => Promise<{ id: string; status: string }>;
}

/** A native session of the fake adapter. Tests end its turn and stream its events. */
interface FakeNative {
  context: AdapterContext;
  finish?: (result: TurnResult) => void;
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
 * A runtime on a real SQLite store and the real harness host, with a fake server, a fake native
 * adapter and a manual clock. A thin controller in between checks the organization and reports
 * host failures by code, as the worker and controller do. Reuse a store path to simulate an app
 * restart.
 */
export async function runtimeFixture(
  options: {
    path?: string;
    capabilities?: Partial<AdapterCapabilities>;
    /** Every native connect fails, as when the native session is gone. */
    failOpen?: boolean;
    now?: number;
  } = {},
) {
  // A restart reuses the given file. Other tests need no file.
  const path = options.path ?? ":memory:";
  const store = await AgentWorkStore.open(path);
  await mkdir(join(tmpdir(), "opencode"), { recursive: true });
  const accountDirectory = await mkdtemp(join(tmpdir(), "opencode", "agent-work-host-"));
  let now = options.now ?? Date.parse("2026-06-01T10:00:00Z");
  const wakes: AgentWakeView[] = [];
  const acked = new Set<string>();
  const messages = new Map<string, AgentSourceMessage>();
  const revokedInvocations = new Set<string>();
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
    async sources(_organization, ids, invocationIds = []) {
      if (outage.sources) throw new TypeError("fetch failed");
      return {
        messages: ids.flatMap((id) => (messages.has(id) ? [messages.get(id)!] : [])),
        inaccessible: ids.filter((id) => !messages.has(id)),
        inaccessibleInvocations: invocationIds.filter((id) => revokedInvocations.has(id)),
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

  /** Native sessions by native session ID, and the ones open in the host by session ID. */
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
      // A native adapter ends its live turn as failed when it disconnects.
      disconnect: async () =>
        native.finish?.({ status: "failed", error: "The native session closed." }),
    };
    natives.set(adapter.nativeSessionId, native);
    return adapter;
  };

  /** Main's view of the sessions open in the worker, which ends them when the worker exits. */
  const workerSessions = createOpenSessions();
  let host: RuntimeHarnessHost;
  let unsubscribe = () => {};

  function deliver(event: HarnessEvent) {
    workerSessions.observe(event);
    if (event.type === "session.closed") open.delete(event.sessionId);
    runtime.onHarnessEvent(event);
  }

  /** A new harness worker: its host has the organization's configuration. */
  async function startHost() {
    host = await createHarnessHost({ accountDirectory, connect, clock: { now: () => now, later } });
    unsubscribe = host.subscribe(deliver);
    await host.configure({
      organizationId,
      agents: catalog.map((agent) => ({
        id: agent.id,
        name: agent.name,
        instructions: "",
        harness: agent.harness,
        enabled: agent.enabled,
        useStartupDefaults: false,
      })),
    });
  }

  /** The worker process exits: its events stop, and main closes every session it had open. */
  async function workerExited() {
    unsubscribe();
    const closed = workerSessions.exited();
    open.clear();
    await host.dispose();
    await startHost();
    for (const event of closed) deliver({ ...event, timestamp: now });
  }

  /** Host commands on their way. The host does file work, so settle waits for them. */
  const inflight = new Set<Promise<unknown>>();
  function hostCommand(command: HarnessCommand): Promise<unknown> {
    const pending = sendToHost(command);
    const tracked = pending.catch(() => {});
    inflight.add(tracked);
    void tracked.finally(() => inflight.delete(tracked));
    return pending;
  }

  /** The command reaches the host, and fails with a registered code as the worker reports it. */
  async function sendToHost(command: HarnessCommand): Promise<unknown> {
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
            // SAFETY: the host returns the result shape of each command, as the controller does.
            return (await (hooked ?? hostCommand(command))) as HarnessCommandResult<C>;
          },
          async closeOrganization(organization) {
            closedOrganizations.push(organization);
            await host.closeOrganization(organization);
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
  await startHost();

  async function settle() {
    for (let round = 0; round < 20; round++) {
      for (let index = 0; index < 40; index++)
        await new Promise((resolve) => setImmediate(resolve));
      if (!inflight.size) return;
      await Promise.all(inflight);
    }
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
      sessionKey: input.threadId
        ? sessionKeys.thread(input.threadId)
        : sessionKeys.dm(conversationId),
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
    /** Sessions open in the host. */
    nativeSessions: () => [...open.keys()],
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
    revokedInvocations,
    callerMessage(input: OwnerMessageInput = {}) {
      const message = ownerMessage({ ...input, threadId: input.threadId ?? crypto.randomUUID() });
      const wake = wakes.at(-1)!;
      const ref = wake.sourceRef;
      if (!("messageId" in ref)) throw new Error("Expected a message wake.");
      const invocationId = crypto.randomUUID();
      const source = messages.get(message.messageId);
      if (source) source.author = { actorId: "caller-actor", name: "Caller", kind: "member" };
      wake.source = "caller_message";
      wake.sourceRef = { invocationId };
      wake.invocation = {
        id: invocationId,
        messageId: ref.messageId,
        conversationId: ref.conversationId,
        threadId: ref.threadId!,
        kind: "mention",
        callerActorId: "caller-actor",
      };
      wake.dedupeKey = `call:${invocationId}`;
      return { ...message, invocationId };
    },
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
    /** Sends an owner message and lets its debounced turn start. */
    async message(input: OwnerMessageInput = {}) {
      const sent = ownerMessage(input);
      await runtime.sync();
      await advance(600);
      return sent;
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
export type RuntimeFixture = Awaited<ReturnType<typeof runtimeFixture>>;
