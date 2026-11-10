import {
  harnessKinds,
  harnessConfigurationSchema,
  turnContextSchema,
  type HarnessAgent,
  type HarnessCommand,
  type HarnessCommandResult,
  type HarnessConfiguration,
  type HarnessEvent,
  type HarnessEventBody,
  type HarnessHost,
  type HarnessKind,
  type HarnessLocalScope,
  type HarnessSessionRef,
  type TurnResult,
} from "@startup-os/contracts/harness";
import type { LocalToolProxy, WorkspaceApiProxy } from "@startup-os/contracts/harness/mcp";
import { leaseTools } from "@startup-os/contracts/harness/tools";

import type { AdapterContext, EventScope, NativeAdapter } from "./adapters/types.ts";
import { materialize, writeDefaultFiles, writeSessionFiles } from "./config.ts";
import { HarnessError } from "./errors.ts";
import { createStartupMcp, type McpLease } from "./mcp.ts";
import { readProfileMemory } from "./memory.ts";
import { discoverModels } from "./models/discover.ts";
import {
  deleteNativeSkill,
  editNativeServer,
  saveNativeSkill,
  scanNativeServers,
  scanNativeSkills,
} from "./native-config.ts";
import { agentDirectory, helperDirectory, safeId, safePath } from "./paths.ts";
import { binaryVersion, resolveExecutable } from "./process.ts";
import { harnessDefinitions } from "./registry.ts";
import { mkdir, realpath } from "node:fs/promises";
import { join } from "node:path";

/** Native sessions stay open this long after their last turn, then the reaper closes them. */
export const sessionKeepAliveMs = 3 * 60 * 1000;
/**
 * After an interrupt, the harness has this long to end the turn. Then the host ends it as
 * interrupted and closes the native session, whose state is unknown.
 */
const interruptGraceMs = 15_000;

type CloseReason = Extract<HarnessEventBody, { type: "session.closed" }>["reason"];

export type ConnectNative = (
  harness: HarnessKind,
  context: AdapterContext,
  resumeId?: string,
) => Promise<NativeAdapter>;

export interface HarnessHostOptions {
  accountDirectory: string;
  workspaceProxy?: WorkspaceApiProxy;
  /** Receives local tool calls other than memory, which the host handles itself. */
  localTools?: LocalToolProxy;
  keepAliveMs?: number;
  interruptGraceMs?: number;
  /** Test seam. Defaults to the registry's native adapters and executable resolution. */
  connect?: ConnectNative;
}

/** The host plus what the desktop needs to build a managed prefix. */
export interface RuntimeHarnessHost extends HarnessHost {
  /** memory/profile.md of the agent, for the managed prefix at epoch start. */
  readProfile(scope: { organizationId: string; agentId: string }): Promise<string>;
  /**
   * Interrupts and closes every session of the organization, whichever organization is
   * configured last. Each live turn ends with turn.completed before its session.closed.
   */
  closeOrganization(organizationId: string): Promise<void>;
}

/** closeOrganization waits this long for a native interrupt before it closes the session. */
const closeInterruptMs = 2_000;

interface LiveTurn {
  turnId: string;
  generation: number;
  settled: Promise<void>;
  /** Ends the turn with this result if the adapter has not ended it yet. */
  force(result: TurnResult): void;
  interruptTimer?: ReturnType<typeof setTimeout>;
}

interface LiveSession {
  ref: HarnessSessionRef;
  agent: HarnessAgent;
  adapter: NativeAdapter;
  epoch: number;
  lease?: McpLease;
  turn?: LiveTurn;
  idleSince: number;
  /** Set when the session must close as soon as its live turn ends. */
  closing?: CloseReason;
  /** The close in progress. */
  closed?: Promise<void>;
}

/** Set once the session is live, so adapter events during open carry no turn. */
interface SessionHolder {
  live?: LiveSession;
}

const failedTurn: TurnResult = {
  status: "failed",
  error: "Native turn failed. Check native authentication and configuration.",
};

export async function createHarnessHost(options: HarnessHostOptions): Promise<RuntimeHarnessHost> {
  await mkdir(options.accountDirectory, { recursive: true });
  const accountDirectory = await realpath(options.accountDirectory);
  /** Each organization's agents, from main's last configure. Main configures every new worker. */
  const configurations = new Map<string, HarnessConfiguration>();
  const keepAliveMs = options.keepAliveMs ?? sessionKeepAliveMs;
  const graceMs = options.interruptGraceMs ?? interruptGraceMs;
  const mcp = await createStartupMcp({
    workspace: options.workspaceProxy,
    local: options.localTools,
  });
  const listeners = new Set<(event: HarnessEvent) => void>();
  const sessions = new Map<string, LiveSession>();
  const opening = new Map<string, Promise<HarnessSessionRef>>();
  let disposed = false;
  const modelDiscovery = new AbortController();
  const connectNative: ConnectNative =
    options.connect ??
    (async (harness, context, resumeId) => harnessDefinitions[harness].connect(context, resumeId));
  const assertOpen = () => {
    if (disposed) throw new HarnessError("disposed", "Harness host is disposed.");
  };

  function publish(event: HarnessEvent) {
    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        /* A subscriber cannot stop a native event stream. */
      }
    }
  }
  function emit(
    scope: { sessionId: string; organizationId: string },
    body: HarnessEventBody,
    turn?: LiveTurn,
  ) {
    publish({
      ...body,
      sessionId: scope.sessionId,
      organizationId: scope.organizationId,
      turnId: turn?.turnId ?? null,
      generation: turn?.generation ?? null,
      timestamp: Date.now(),
    });
  }

  async function directory(scope: HarnessLocalScope) {
    assertOpen();
    if (!harnessKinds.includes(scope.harness))
      throw new HarnessError("invalid-harness", "Unknown harness.");
    safeId(scope.organizationId);
    safeId(scope.agentId);
    const configuration = configurations.get(scope.organizationId);
    if (!configuration?.agents.some((agent) => agent.id === scope.agentId))
      throw new HarnessError("agent-not-found", "Agent is not configured in this organization.");
    // Scan must not create a missing agent or a missing native config directory.
    const path = await safePath(
      accountDirectory,
      join("orgs", scope.organizationId, scope.agentId),
    );
    if ((await realpath(path)) !== path)
      throw new HarnessError("unsafe-path", "Agent folder is not canonical.");
    return path;
  }

  /** Closes a session once. Callers during the close wait for the same close. */
  async function closeSession(live: LiveSession, reason: CloseReason) {
    if (live.closed) return live.closed;
    if (sessions.get(live.ref.id) !== live) return;
    sessions.delete(live.ref.id);
    live.closed = (async () => {
      live.lease?.revoke();
      try {
        await live.adapter.disconnect();
      } finally {
        // The adapter ends a live turn on disconnect; report it before the session closes.
        live.turn?.force({ status: "failed", error: "The native session closed." });
        await live.turn?.settled;
        emit(
          { sessionId: live.ref.id, organizationId: live.ref.organizationId },
          { type: "session.closed", reason },
        );
      }
    })();
    return live.closed;
  }

  async function open(command: Extract<HarnessCommand, { type: "open" }>) {
    const configuration = configurations.get(command.organizationId);
    if (!configuration)
      throw new HarnessError(
        "organization-not-configured",
        "Configure this organization before starting native agents.",
      );
    const agent = configuration.agents.find((entry) => entry.id === command.agentId);
    if (!agent)
      throw new HarnessError("agent-not-found", "Agent is not configured in this organization.");
    if (!agent.enabled) throw new HarnessError("agent-disabled", "This agent is disabled.");
    const agentFolder = await agentDirectory(accountDirectory, command.organizationId, agent.id);
    const folder =
      command.folder === "main"
        ? agentFolder
        : await helperDirectory(
            accountDirectory,
            command.organizationId,
            agent.id,
            command.folder.helperId,
          );
    const definition = harnessDefinitions[agent.harness];
    // The instructions file follows the agent at each open, not only at first write.
    await writeSessionFiles(
      folder,
      command.organizationId,
      agent,
      definition.prefixInInstructions ? command.prefix : undefined,
    );
    const lease = agent.useStartupDefaults
      ? mcp.issue({
          organizationId: command.organizationId,
          agentId: agent.id,
          sessionId: command.sessionId,
          tools: leaseTools(command.folder === "main" ? "main" : "helper"),
          folder,
          agentFolder,
        })
      : undefined;
    const holder: SessionHolder = {};
    const scope = { sessionId: command.sessionId, organizationId: command.organizationId };
    try {
      const context: AdapterContext = {
        model: agent.model,
        directory: folder,
        executable: options.connect ? agent.harness : await resolveExecutable(agent.harness),
        lease,
        prefix: command.prefix,
        emit: (body: HarnessEventBody, eventScope: EventScope = "turn") =>
          emit(scope, body, eventScope === "turn" ? holder.live?.turn : undefined),
      };
      let adapter: NativeAdapter;
      let resumed = Boolean(command.nativeSessionId);
      try {
        adapter = await connectNative(agent.harness, context, command.nativeSessionId);
      } catch (error) {
        if (!command.nativeSessionId) throw error;
        if (command.requireResume)
          throw new HarnessError("resume-failed", "The native session could not be resumed.", {
            cause: error,
          });
        adapter = await connectNative(agent.harness, context);
        resumed = false;
      }
      const ref: HarnessSessionRef = {
        id: command.sessionId,
        organizationId: command.organizationId,
        agentId: agent.id,
        harness: agent.harness,
        nativeSessionId: adapter.nativeSessionId,
        folder: command.folder,
        capabilities: { ...adapter.capabilities },
        resumed,
      };
      const live: LiveSession = {
        ref,
        agent,
        adapter,
        epoch: command.epoch,
        lease,
        idleSince: Date.now(),
      };
      holder.live = live;
      if (disposed) {
        await adapter.disconnect();
        throw new HarnessError("disposed", "Harness host is disposed.");
      }
      sessions.set(ref.id, live);
      return structuredClone(ref);
    } catch (error) {
      lease?.revoke();
      throw error;
    }
  }

  function startTurn(live: LiveSession, command: Extract<HarnessCommand, { type: "turn" }>) {
    if (live.turn) throw new HarnessError("turn-active", "A turn is already running.");
    if (live.closing) throw new HarnessError("not-connected", "The session is closing.");
    if (!command.input.text.trim()) throw new HarnessError("empty-input", "Turn input is empty.");
    const context = turnContextSchema.parse(command.context);
    if (context.turnId !== command.turnId)
      throw new HarnessError("invalid-turn-context", "Turn context belongs to another turn.");
    const settled = Promise.withResolvers<void>();
    const forced = Promise.withResolvers<TurnResult>();
    const turn: LiveTurn = {
      turnId: command.turnId,
      generation: command.generation,
      settled: settled.promise,
      force: forced.resolve,
    };
    live.turn = turn;
    live.lease?.bind(context);
    const scope = { sessionId: live.ref.id, organizationId: live.ref.organizationId };
    emit(scope, { type: "turn.started" }, turn);
    // turn acknowledges at once so interrupts and steering can reach the live turn.
    const native = Promise.resolve()
      .then(() => live.adapter.turn(command.input, { mode: command.mode }))
      .catch(() => failedTurn);
    void Promise.race([native, forced.promise]).then((result) => {
      clearTimeout(turn.interruptTimer);
      emit(scope, { type: "turn.completed", result }, turn);
      if (live.turn === turn) {
        live.lease?.unbind();
        live.turn = undefined;
        live.idleSince = Date.now();
      }
      settled.resolve();
      if (live.closing) void closeSession(live, live.closing).catch(() => {});
    });
  }

  /** Every interrupt ends in a terminal event: the harness's own, or the host's after the grace. */
  function armInterrupt(live: LiveSession, turn: LiveTurn) {
    if (turn.interruptTimer) return;
    turn.interruptTimer = setTimeout(() => {
      if (live.turn !== turn) return;
      turn.force({
        status: "interrupted",
        error: "The harness did not confirm the interrupt.",
      });
      live.closing ??= "closed";
    }, graceMs);
    turn.interruptTimer.unref();
  }

  function session(command: { organizationId: string; sessionId: string }) {
    const live = sessions.get(command.sessionId);
    if (!live || live.ref.organizationId !== command.organizationId)
      throw new HarnessError("not-connected", "Open the session first.");
    live.idleSince = Date.now();
    return live;
  }

  /** Returns the open session of this epoch, or replaces a session of another epoch. */
  async function openSession(
    command: Extract<HarnessCommand, { type: "open" }>,
  ): Promise<HarnessSessionRef> {
    for (;;) {
      const pending = opening.get(command.sessionId);
      if (pending && !(await pending.then(Boolean, () => false))) return pending;
      const existing = sessions.get(command.sessionId);
      if (!existing) break;
      if (
        existing.ref.organizationId !== command.organizationId ||
        existing.ref.agentId !== command.agentId ||
        JSON.stringify(existing.ref.folder) !== JSON.stringify(command.folder)
      )
        throw new HarnessError("session-conflict", "Session belongs to another agent folder.");
      const stale =
        existing.epoch !== command.epoch ||
        (command.nativeSessionId !== undefined &&
          command.nativeSessionId !== existing.ref.nativeSessionId);
      if (!stale && !existing.closing) {
        existing.idleSince = Date.now();
        return structuredClone(existing.ref);
      }
      // A session waiting to close keeps its live turn; it is never returned.
      if (!stale && existing.turn)
        throw new HarnessError("turn-active", "The session closes after its live turn.");
      await closeSession(existing, existing.closing ?? "closed");
    }
    const started = open(command).finally(() => opening.delete(command.sessionId));
    opening.set(command.sessionId, started);
    return started;
  }

  async function run(command: HarnessCommand): Promise<HarnessCommandResult> {
    switch (command.type) {
      case "open":
        return openSession(command);
      case "turn":
        startTurn(session(command), command);
        return;
      case "steer": {
        const live = session(command);
        if (live.turn?.turnId !== command.turnId)
          throw new HarnessError("turn-not-live", "That turn is not running.");
        if (!live.adapter.capabilities.steer || !live.adapter.steer)
          throw new HarnessError("steer-unsupported", "This harness cannot steer a live turn.");
        await live.adapter.steer({ inputId: command.inputId, text: command.text });
        return;
      }
      case "interrupt": {
        const live = sessions.get(command.sessionId);
        const turn = live?.turn;
        if (!live || live.ref.organizationId !== command.organizationId || !turn)
          throw new HarnessError("no-live-turn", "No turn is running in this session.");
        if (turn.turnId !== command.turnId)
          throw new HarnessError("no-live-turn", "That turn is not running.");
        // Armed before the native call, which may itself hang or fail.
        armInterrupt(live, turn);
        return live.adapter.interrupt();
      }
      case "respond":
        await session(command).adapter.respond(command.requestId, command.response);
        return;
      case "compact": {
        const live = session(command);
        if (!live.adapter.capabilities.compact || !live.adapter.compact)
          throw new HarnessError("compact-unsupported", "This harness cannot compact.");
        if (live.turn) throw new HarnessError("turn-active", "Compact between turns.");
        await live.adapter.compact();
        return;
      }
      case "close": {
        const live = sessions.get(command.sessionId);
        if (live && live.ref.organizationId === command.organizationId)
          await closeSession(live, "closed");
        return;
      }
    }
  }

  const reaper = setInterval(
    () => {
      const now = Date.now();
      for (const live of sessions.values())
        if (!live.turn && now - live.idleSince >= keepAliveMs)
          void closeSession(live, "idle").catch(() => {});
    },
    Math.min(30_000, Math.max(10, Math.floor(keepAliveMs / 6))),
  );
  reaper.unref();

  return {
    async listModels(scope) {
      assertOpen();
      return discoverModels(
        scope.harness,
        scope.agentId ? await directory({ ...scope, agentId: scope.agentId }) : accountDirectory,
        undefined,
        modelDiscovery.signal,
      );
    },
    async configure(input) {
      assertOpen();
      const configuration: HarnessConfiguration = harnessConfigurationSchema.parse(input);
      for (const live of sessions.values()) {
        if (live.ref.organizationId !== configuration.organizationId) continue;
        const next = configuration.agents.find(
          (agent) => agent.id === live.ref.agentId && agent.enabled,
        );
        if (next && JSON.stringify(next) === JSON.stringify(live.agent)) continue;
        // A live turn finishes on the configuration it started with; the session closes after.
        if (live.turn) live.closing = "configuration";
        else await closeSession(live, "configuration");
      }
      await materialize(accountDirectory, configuration);
      configurations.set(configuration.organizationId, configuration);
    },
    async scanConfiguration(scope) {
      const root = await directory(scope);
      return {
        ...scope,
        skills: await scanNativeSkills(root, scope.harness),
        mcpServers: await scanNativeServers(root, scope.harness),
      };
    },
    async saveSkill(input) {
      await saveNativeSkill(await directory(input), input.harness, input.skill);
    },
    async deleteSkill(input) {
      await deleteNativeSkill(await directory(input), input.harness, input.id);
    },
    async resetDefaults(scope) {
      const root = await directory(scope);
      const agent = configurations
        .get(scope.organizationId)
        ?.agents.find((entry) => entry.id === scope.agentId && entry.harness === scope.harness);
      if (!agent)
        throw new HarnessError("agent-not-found", "Agent is not configured for this harness.");
      await writeDefaultFiles(root, scope.organizationId, agent, true);
    },
    async saveMcpServer(input) {
      await editNativeServer(await directory(input), input.harness, input.server.id, input.server);
    },
    async deleteMcpServer(input) {
      await editNativeServer(await directory(input), input.harness, input.id);
    },
    async inspect() {
      assertOpen();
      return Promise.all(
        harnessKinds.map(async (harness) => {
          try {
            const executable = await resolveExecutable(harness);
            const version = await binaryVersion(executable);
            const definition = harnessDefinitions[harness];
            const available =
              !("available" in definition) || (await definition.available(executable));
            return { harness, available, version };
          } catch {
            return { harness, available: false };
          }
        }),
      );
    },
    async readProfile(scope) {
      assertOpen();
      safeId(scope.organizationId);
      safeId(scope.agentId);
      return readProfileMemory(
        await agentDirectory(accountDirectory, scope.organizationId, scope.agentId),
      );
    },
    async closeOrganization(organizationId) {
      assertOpen();
      const closing = [...sessions.values()].filter(
        (live) => live.ref.organizationId === organizationId,
      );
      const results = await Promise.allSettled(
        closing.map(async (live) => {
          // No new turn starts while the native turn stops.
          live.closing ??= "closed";
          if (live.turn) {
            let timer: ReturnType<typeof setTimeout> | undefined;
            const waited = new Promise<void>((resolve) => {
              timer = setTimeout(resolve, closeInterruptMs);
              timer.unref();
            });
            await Promise.race([live.adapter.interrupt().catch(() => {}), waited]);
            clearTimeout(timer);
          }
          await closeSession(live, "closed");
        }),
      );
      const failure = results.find((entry) => entry.status === "rejected");
      if (failure?.status === "rejected") throw failure.reason;
    },
    async execute<C extends HarnessCommand>(command: C): Promise<HarnessCommandResult<C>> {
      assertOpen();
      // SAFETY: run() returns the result type of the command variant it was called with.
      return (await run(command)) as HarnessCommandResult<C>;
    },
    subscribe(listener) {
      assertOpen();
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      clearInterval(reaper);
      modelDiscovery.abort();
      const results = await Promise.allSettled(
        [...sessions.values()].map((live) => closeSession(live, "closed")),
      );
      sessions.clear();
      listeners.clear();
      await mcp.close();
      const failure = results.find((entry) => entry.status === "rejected");
      if (failure?.status === "rejected") throw failure.reason;
    },
  };
}
