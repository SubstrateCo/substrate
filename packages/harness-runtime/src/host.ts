import {
  harnessKinds,
  harnessConfigurationSchema,
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
  type ToolProvider,
  type TurnResult,
} from "@substrate/contracts/harness-runtime";

import { detectAgent, requireAgent } from "./acp/detect.ts";
import { openAcpPeer } from "./acp/index.ts";
import type { HostTools } from "./adapters/tool-label.ts";
import type { AdapterContext, EventScope, NativeAdapter } from "./adapters/types.ts";
import { materialize, writeDefaultFiles } from "./config.ts";
import { HarnessError } from "./errors.ts";
import { createStartupMcp, type McpLease } from "./mcp.ts";
import { discoverModels } from "./models/discover.ts";
import { deleteNativeSkill, saveNativeSkill, scanNativeSkills } from "./native-config.ts";
import { agentDirectory, helperDirectory, safeId, safePath, workspaceDirectory } from "./paths.ts";
import { connectHarness, harnessDefinitions, type HarnessDefinition } from "./registry.ts";
import {
  nativeSessionMachine,
  transitionSession,
  type NativeSessionState,
} from "./session-machine.ts";
import { createSignIns, type SignInOptions, type SignIns } from "./sign-in.ts";
import * as skillPackages from "./skill-packages.ts";
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
  prefix: string,
  resumeId?: string,
) => Promise<NativeAdapter>;

/** Time for the host's timestamps, interrupt grace and idle reaper. */
export interface HostClock {
  now(): number;
  /** Runs callback once after milliseconds. The timer does not keep the process alive. */
  later(callback: () => void, milliseconds: number): () => void;
}

const systemClock: HostClock = {
  now: () => Date.now(),
  later(callback, milliseconds) {
    const timer = setTimeout(callback, milliseconds);
    timer.unref();
    return () => clearTimeout(timer);
  },
};

export interface HarnessHostOptions<Binding = unknown> {
  accountDirectory: string;
  /**
   * The host's tools. Sessions of agents with tools get an MCP lease that serves them during
   * each turn. Without a provider, sessions get no host MCP server.
   */
  tools?: ToolProvider<Binding>;
  keepAliveMs?: number;
  interruptGraceMs?: number;
  /** Test seam. Defaults to the registry's native adapters and executable resolution. */
  connect?: ConnectNative;
  /** Test seam. Defaults to the system clock. */
  clock?: HostClock;
  /** Test seam. Defaults to ACP peers of detected agents. */
  signIn?: Partial<Omit<SignInOptions, "cwd">>;
}

/** The host plus the organization and sign-in controls the desktop uses. */
export interface RuntimeHarnessHost extends HarnessHost {
  /**
   * Interrupts and closes every session of the organization, whichever organization is
   * configured last. Each live turn ends with turn.completed before its session.closed.
   */
  closeOrganization(organizationId: string): Promise<void>;
  /** Starts the agent's sign-in method. Credentials stay in the agent's own store. */
  signIn: SignIns["start"];
  /** Output and status of a sign-in since a cursor. */
  readSignIn(input: Parameters<SignIns["read"]>[0]): Promise<ReturnType<SignIns["read"]>>;
  /** Sends one line to a terminal sign-in. */
  sendSignInInput(input: Parameters<SignIns["write"]>[0]): Promise<void>;
  cancelSignIn: SignIns["cancel"];
  signOut: SignIns["signOut"];
}

/** Bounds native interrupt waits and cleanup waits for cancelled opens. */
const nativeCloseWaitMs = 2_000;

interface LiveTurn {
  turnId: string;
  generation: number;
  settled: Promise<void>;
  /** Ends the turn with this result if the adapter has not ended it yet. */
  force(result: TurnResult): void;
  /** Cancels the interrupt grace, once an interrupt armed it. */
  cancelInterrupt?: () => void;
}

interface SessionLifecycle {
  state: NativeSessionState;
  reason?: CloseReason;
  lease?: McpLease;
  /** The native cleanup in progress, including a cancelled open's cleanup. */
  closed?: Promise<void>;
}

interface OpeningSession {
  lifecycle: SessionLifecycle;
  organizationId: string;
  agentId: string;
  promise: Promise<HarnessSessionRef>;
}

interface LiveSession extends SessionLifecycle {
  ref: HarnessSessionRef;
  agent: HarnessAgent;
  adapter: NativeAdapter;
  epoch: number;
  /** The user-added MCP servers, as JSON, that the native session was set up with. */
  mcpServers: string;
  /** The working folder the open command named, if any. */
  workspace?: string;
  turn?: LiveTurn;
  idleSince: number;
}

/** Set once the session is live, so adapter events during open carry no turn. */
interface SessionHolder {
  live?: LiveSession;
}

/**
 * What a live session runs on: the agent without its managed skills, which apply when a folder
 * is written, and with the tools of the session's folder.
 */
function sessionDefinition(agent: HarnessAgent, folder: HarnessSessionRef["folder"]) {
  const { managedSkills: _skills, tools, ...rest } = agent;
  return JSON.stringify({ ...rest, tools: tools?.[folder === "main" ? "main" : "helper"] ?? null });
}

/** The provider's binding for a turn. A context of another turn fails the turn command. */
function bindTurn<Binding>(
  provider: ToolProvider<Binding>,
  command: Extract<HarnessCommand, { type: "turn" }>,
): Binding {
  try {
    return provider.bind(command.context, command.turnId);
  } catch (error) {
    throw new HarnessError("invalid-turn-context", "Turn context belongs to another turn.", {
      cause: error,
    });
  }
}

const failedTurn: TurnResult = {
  status: "failed",
  error: "Native turn failed. Check native authentication and configuration.",
};

export async function createHarnessHost<Binding = unknown>(
  options: HarnessHostOptions<Binding>,
): Promise<RuntimeHarnessHost> {
  await mkdir(options.accountDirectory, { recursive: true });
  const accountDirectory = await realpath(options.accountDirectory);
  /** Each organization's agents, from main's last configure. Main configures every new worker. */
  const configurations = new Map<string, HarnessConfiguration>();
  const keepAliveMs = options.keepAliveMs ?? sessionKeepAliveMs;
  const graceMs = options.interruptGraceMs ?? interruptGraceMs;
  const clock = options.clock ?? systemClock;
  const provider = options.tools;
  const mcp = provider ? await createStartupMcp(provider) : undefined;
  const hostTools: HostTools | undefined = provider && {
    server: provider.server.name,
    title: (tool) => provider.describe(tool)?.title,
  };
  const listeners = new Set<(event: HarnessEvent) => void>();
  const sessions = new Map<string, LiveSession>();
  const opening = new Map<string, OpeningSession>();
  const changingFiles = new Set<string>();
  let disposed = false;
  let disposal: Promise<void> | undefined;
  const modelDiscovery = new AbortController();
  const connectNative: ConnectNative = options.connect ?? connectHarness;
  const signIns = createSignIns({
    cwd: accountDirectory,
    openPeer: openAcpPeer,
    requireAgent,
    ...options.signIn,
  });
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
      timestamp: clock.now(),
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

  async function packageDirectory(scope: HarnessLocalScope) {
    const root = await directory(scope);
    if (
      !configurations
        .get(scope.organizationId)
        ?.agents.some((agent) => agent.id === scope.agentId && agent.harness === scope.harness)
    )
      throw new HarnessError("invalid-harness", "Use this agent's configured harness.");
    return root;
  }

  async function changeFiles<T>(scope: HarnessLocalScope, action: (root: string) => Promise<T>) {
    const key = `${scope.organizationId}/${scope.agentId}`;
    if (changingFiles.has(key)) throw new HarnessError("session-closing", "Skill files are busy.");
    changingFiles.add(key);
    try {
      const root = await packageDirectory(scope);
      const live = [...sessions.values()].filter(
        (session) =>
          session.ref.organizationId === scope.organizationId &&
          session.ref.agentId === scope.agentId,
      );
      if (
        live.some((session) => session.turn) ||
        [...opening.values()].some(
          (session) =>
            session.organizationId === scope.organizationId && session.agentId === scope.agentId,
        )
      )
        throw new HarnessError("turn-active", "Wait until this agent is idle to change skills.");
      await Promise.all(live.map((session) => closeSession(session, "configuration")));
      return await action(root);
    } finally {
      changingFiles.delete(key);
    }
  }

  /** Closes a session once. Callers during the close wait for the same close. */
  async function closeSession(live: LiveSession, reason: CloseReason) {
    if (live.closed) return live.closed;
    if (sessions.get(live.ref.id) !== live) return;
    if (live.state !== "closing") transitionSession(live, "close");
    live.reason ??= reason;
    live.closed = (async () => {
      live.lease?.revoke();
      try {
        await live.adapter.disconnect();
      } finally {
        // The adapter ends a live turn on disconnect; report it before the session closes.
        live.turn?.force({ status: "failed", error: "The native session closed." });
        await live.turn?.settled;
        transitionSession(live, "disconnected");
        sessions.delete(live.ref.id);
        emit(
          { sessionId: live.ref.id, organizationId: live.ref.organizationId },
          { type: "session.closed", reason: live.reason! },
        );
      }
    })();
    return live.closed;
  }

  async function open(
    command: Extract<HarnessCommand, { type: "open" }>,
    lifecycle: SessionLifecycle,
  ) {
    if (changingFiles.has(`${command.organizationId}/${command.agentId}`))
      throw new HarnessError("session-closing", "Skill files are being updated.");
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
    const folder =
      command.folder === "main"
        ? await agentDirectory(accountDirectory, command.organizationId, agent.id)
        : await helperDirectory(
            accountDirectory,
            command.organizationId,
            agent.id,
            command.folder.helperId,
          );
    const definition: HarnessDefinition = harnessDefinitions[agent.harness];
    const workspace = command.workspace
      ? await workspaceDirectory(accountDirectory, command.workspace)
      : undefined;
    // The instructions file follows the agent at each open, not only at first write.
    await writeDefaultFiles(folder, agent, {
      replace: true,
      managedPrefix: definition.prefixChannel === "instructions" ? command.prefix : undefined,
    });
    // A harness working in another folder does not read this folder's instructions file. Unless
    // its launch environment points it there, they follow the prefix in the system prompt.
    const prefix =
      workspace && !definition.managedEnvironment
        ? `${command.prefix}\n${agent.instructions}`
        : command.prefix;
    const tools = agent.tools?.[command.folder === "main" ? "main" : "helper"];
    const lease =
      mcp && tools
        ? mcp.issue({
            organizationId: command.organizationId,
            agentId: agent.id,
            sessionId: command.sessionId,
            tools,
            folder,
          })
        : undefined;
    lifecycle.lease = lease;
    if (lifecycle.state === "closing") lease?.revoke();
    const holder: SessionHolder = {};
    const scope = { sessionId: command.sessionId, organizationId: command.organizationId };
    try {
      const context: AdapterContext = {
        model: agent.model,
        directory: workspace ?? folder,
        managedDirectory: workspace && folder,
        lease,
        hostTools,
        mcpServers: command.mcpServers,
        emit: (body: HarnessEventBody, eventScope: EventScope = "turn") =>
          emit(scope, body, eventScope === "turn" ? holder.live?.turn : undefined),
      };
      let adapter: NativeAdapter;
      let resumed = Boolean(command.nativeSessionId);
      try {
        adapter = await connectNative(agent.harness, context, prefix, command.nativeSessionId);
      } catch (error) {
        if (!command.nativeSessionId) throw error;
        if (command.requireResume)
          throw new HarnessError("resume-failed", "The native session could not be resumed.", {
            cause: error,
          });
        adapter = await connectNative(agent.harness, context, prefix);
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
      const live: LiveSession = Object.assign(lifecycle, {
        ref,
        agent,
        adapter,
        epoch: command.epoch,
        mcpServers: JSON.stringify(command.mcpServers),
        workspace: command.workspace,
        lease,
        idleSince: clock.now(),
      });
      holder.live = live;
      sessions.set(ref.id, live);
      // A native exit closes the session at once; a close already in progress keeps its reason.
      void adapter.closed?.then(() => closeSession(live, "native_exited")).catch(() => {});
      if (live.state === "closing" || disposed) {
        await closeSession(live, "closed");
        throw new HarnessError(
          disposed ? "disposed" : "not-connected",
          "The session closed while opening.",
        );
      }
      transitionSession(live, "connected");
      return structuredClone(ref);
    } catch (error) {
      lease?.revoke();
      throw error;
    }
  }

  function startTurn(live: LiveSession, command: Extract<HarnessCommand, { type: "turn" }>) {
    if (changingFiles.has(`${live.ref.organizationId}/${live.ref.agentId}`))
      throw new HarnessError("session-closing", "Skill files are being updated.");
    if (live.turn) throw new HarnessError("turn-active", "A turn is already running.");
    if (!nativeSessionMachine.canFire(live.state, "startTurn"))
      throw new HarnessError("not-connected", "The session is closing.");
    if (!command.input.text.trim()) throw new HarnessError("empty-input", "Turn input is empty.");
    const bound = provider && { turnId: command.turnId, binding: bindTurn(provider, command) };
    const settled = Promise.withResolvers<void>();
    const forced = Promise.withResolvers<TurnResult>();
    const turn: LiveTurn = {
      turnId: command.turnId,
      generation: command.generation,
      settled: settled.promise,
      force: forced.resolve,
    };
    transitionSession(live, "startTurn");
    live.turn = turn;
    if (bound) live.lease?.bind(bound);
    const scope = { sessionId: live.ref.id, organizationId: live.ref.organizationId };
    emit(scope, { type: "turn.started" }, turn);
    // turn acknowledges at once so interrupts and steering can reach the live turn.
    const native = Promise.resolve()
      .then(() => live.adapter.turn(command.input, { mode: command.mode }))
      .catch(() => failedTurn);
    void Promise.race([native, forced.promise]).then((result) => {
      turn.cancelInterrupt?.();
      emit(scope, { type: "turn.completed", result }, turn);
      if (live.turn === turn) {
        live.lease?.unbind();
        live.turn = undefined;
        live.idleSince = clock.now();
        if (live.state === "running") transitionSession(live, "finishTurn");
      }
      settled.resolve();
      if (live.state === "draining") void closeSession(live, live.reason!).catch(() => {});
    });
  }

  /** Every interrupt ends in a terminal event: the harness's own, or the host's after the grace. */
  function armInterrupt(live: LiveSession, turn: LiveTurn) {
    if (turn.cancelInterrupt) return;
    turn.cancelInterrupt = clock.later(() => {
      if (live.turn !== turn) return;
      turn.force({
        status: "interrupted",
        error: "The harness did not confirm the interrupt.",
      });
      void closeWhenIdle(live, "closed")?.catch(() => {});
    }, graceMs);
  }

  /** Closes the session now, or as soon as its live turn ends. No new turn starts meanwhile. */
  function closeWhenIdle(live: LiveSession, reason: CloseReason) {
    live.reason ??= reason;
    if (nativeSessionMachine.canFire(live.state, "drain")) transitionSession(live, "drain");
    return live.turn ? undefined : closeSession(live, live.reason);
  }

  function session(command: { organizationId: string; sessionId: string }) {
    const live = sessions.get(command.sessionId);
    if (!live || live.ref.organizationId !== command.organizationId || live.state === "closing")
      throw new HarnessError("not-connected", "Open the session first.");
    live.idleSince = clock.now();
    return live;
  }

  /** Returns the open session of this epoch, or replaces a session of another epoch. */
  async function openSession(
    command: Extract<HarnessCommand, { type: "open" }>,
  ): Promise<HarnessSessionRef> {
    for (;;) {
      assertOpen();
      const pending = opening.get(command.sessionId);
      if (pending) {
        await pending.promise;
        assertOpen();
      }
      const existing = sessions.get(command.sessionId);
      if (!existing) break;
      if (
        existing.ref.organizationId !== command.organizationId ||
        existing.ref.agentId !== command.agentId ||
        JSON.stringify(existing.ref.folder) !== JSON.stringify(command.folder)
      )
        throw new HarnessError("session-conflict", "Session belongs to another agent folder.");
      // Changed MCP servers and working folders apply at session setup, so the session reopens.
      const stale =
        existing.epoch !== command.epoch ||
        existing.mcpServers !== JSON.stringify(command.mcpServers) ||
        existing.workspace !== command.workspace ||
        (command.nativeSessionId !== undefined &&
          command.nativeSessionId !== existing.ref.nativeSessionId);
      if (!stale && (existing.state === "idle" || existing.state === "running")) {
        existing.idleSince = clock.now();
        return structuredClone(existing.ref);
      }
      // A session waiting to close keeps its live turn; it is never returned.
      if (!stale && existing.state === "draining")
        throw new HarnessError("session-closing", "The session closes after its live turn.");
      await closeSession(existing, existing.reason ?? "closed");
    }
    const lifecycle: SessionLifecycle = { state: "opening" };
    const started = open(command, lifecycle)
      .catch((error) => {
        if (nativeSessionMachine.canFire(lifecycle.state, "openFailed"))
          transitionSession(lifecycle, "openFailed");
        throw error;
      })
      .finally(() => opening.delete(command.sessionId));
    opening.set(command.sessionId, {
      agentId: command.agentId,
      lifecycle,
      organizationId: command.organizationId,
      promise: started,
    });
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
        if (live.state === "closing" || turn.turnId !== command.turnId)
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
        const pending = opening.get(command.sessionId);
        if (pending?.organizationId === command.organizationId) {
          cancelOpening(pending.lifecycle);
          await waitForOpeningClose(pending);
        }
        const live = sessions.get(command.sessionId);
        if (live && live.ref.organizationId === command.organizationId)
          await closeSession(live, "closed");
        return;
      }
    }
  }

  function cancelOpening(lifecycle: SessionLifecycle) {
    if (nativeSessionMachine.canFire(lifecycle.state, "close"))
      transitionSession(lifecycle, "close");
    lifecycle.reason ??= "closed";
    lifecycle.lease?.revoke();
  }

  async function waitForOpeningClose(pending: OpeningSession) {
    const timeout = Promise.withResolvers<never>();
    const cancel = clock.later(() => {
      timeout.reject(
        new HarnessError(
          "request-timeout",
          "The native session did not finish opening and closing in time.",
        ),
      );
    }, nativeCloseWaitMs);
    const cleanup = async () => {
      // A cancelled open rejects by design; native cleanup failures still reach the closer.
      await pending.promise.catch(() => {});
      await pending.lifecycle.closed;
    };
    try {
      // Keep the cancelled open tracked: if connect finishes late, open() still disconnects it.
      await Promise.race([cleanup(), timeout.promise]);
    } finally {
      cancel();
    }
  }

  const reapEveryMs = Math.min(30_000, Math.max(10, Math.floor(keepAliveMs / 6)));
  let stopReaper = () => {};
  function reap() {
    const now = clock.now();
    for (const live of sessions.values())
      if (!live.turn && now - live.idleSince >= keepAliveMs)
        void closeSession(live, "idle").catch(() => {});
    stopReaper = clock.later(reap, reapEveryMs);
  }
  stopReaper = clock.later(reap, reapEveryMs);

  return {
    async listModels(scope) {
      assertOpen();
      return discoverModels(
        scope.harness,
        scope.agentId ? await directory({ ...scope, agentId: scope.agentId }) : accountDirectory,
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
        if (
          next &&
          sessionDefinition(next, live.ref.folder) ===
            sessionDefinition(live.agent, live.ref.folder)
        )
          continue;
        // A live turn finishes on the configuration it started with; the session closes after.
        await closeWhenIdle(live, "configuration");
      }
      await materialize(accountDirectory, configuration);
      configurations.set(configuration.organizationId, configuration);
    },
    async scanConfiguration(scope) {
      const root = await directory(scope);
      return {
        ...scope,
        skills: await scanNativeSkills(root, scope.harness),
      };
    },
    async scanSkillPackages(scope) {
      return skillPackages.scanSkillPackages(await packageDirectory(scope));
    },
    async previewSkillSource(input) {
      return skillPackages.previewSkillSource(await packageDirectory(input), input.source);
    },
    async installSkillPackage(input) {
      const reserved = configurations
        .get(input.organizationId)
        ?.agents.find((agent) => agent.id === input.agentId)
        ?.managedSkills.some((skill) => skill.id === input.name);
      if (reserved)
        throw new HarnessError("invalid-skill", "This name is reserved for a managed skill.");
      return changeFiles(input, (root) =>
        skillPackages.installSkillPackage(root, input.harness, input.source, input.name),
      );
    },
    async removeSkillPackage(input) {
      return changeFiles(input, (root) =>
        skillPackages.removeSkillPackage(root, input.harness, input.name),
      );
    },
    async updateSkillPackages(input) {
      const state = await skillPackages.scanSkillPackages(await packageDirectory(input));
      if (
        !state.skills.length ||
        (input.scheduled && !skillPackages.skillUpdateDue(state.updates, clock.now()))
      )
        return;
      return changeFiles(input, (root) =>
        skillPackages.updateSkillPackages(root, input.harness, input.scheduled, clock.now()),
      );
    },
    async setSkillUpdateFrequency(input) {
      return skillPackages.setSkillUpdateFrequency(await packageDirectory(input), input.frequency);
    },
    async saveSkill(input) {
      const root = await directory(input);
      if (
        (await skillPackages.scanSkillPackages(root)).skills.some(
          (skill) => skill.name === input.skill.id,
        )
      )
        throw new HarnessError(
          "invalid-skill",
          "Catalog skills cannot be edited. Create a custom skill instead.",
        );
      await saveNativeSkill(root, input.harness, input.skill);
    },
    async deleteSkill(input) {
      const root = await directory(input);
      if (
        (await skillPackages.scanSkillPackages(root)).skills.some(
          (skill) => skill.name === input.id,
        )
      )
        throw new HarnessError("invalid-skill", "Remove catalog skills through the catalog.");
      await deleteNativeSkill(root, input.harness, input.id);
    },
    async resetDefaults(scope) {
      const root = await directory(scope);
      const agent = configurations
        .get(scope.organizationId)
        ?.agents.find((entry) => entry.id === scope.agentId && entry.harness === scope.harness);
      if (!agent)
        throw new HarnessError("agent-not-found", "Agent is not configured for this harness.");
      await writeDefaultFiles(root, agent, { replace: true });
    },
    async inspect() {
      assertOpen();
      return Promise.all(
        harnessKinds.map(async (harness) => {
          const launch = await detectAgent(harness).catch(() => undefined);
          return launch
            ? { harness, available: true, version: launch.version }
            : { harness, available: false };
        }),
      );
    },
    async closeOrganization(organizationId) {
      assertOpen();
      const pending = [...opening.values()].filter(
        (entry) => entry.organizationId === organizationId,
      );
      for (const entry of pending) cancelOpening(entry.lifecycle);
      // A cancelled open may also be in sessions while disconnecting; its bounded wait owns cleanup.
      const closing = [...sessions.values()].filter(
        (live) =>
          live.ref.organizationId === organizationId &&
          !pending.some((entry) => entry.lifecycle === live),
      );
      const results = await Promise.allSettled([
        ...pending.map(waitForOpeningClose),
        ...closing.map(async (live) => {
          // No new turn starts while the native turn stops.
          const idle = closeWhenIdle(live, "closed");
          if (idle) return idle;
          let cancel = () => {};
          const waited = new Promise<void>((resolve) => {
            cancel = clock.later(resolve, nativeCloseWaitMs);
          });
          await Promise.race([live.adapter.interrupt().catch(() => {}), waited]);
          cancel();
          await closeSession(live, "closed");
        }),
      ]);
      const failure = results.find((entry) => entry.status === "rejected");
      if (failure?.status === "rejected") throw failure.reason;
    },
    async signIn(input) {
      assertOpen();
      if (!harnessKinds.includes(input.harness))
        throw new HarnessError("invalid-harness", "Unknown harness.");
      return signIns.start(input);
    },
    async readSignIn(input) {
      assertOpen();
      return signIns.read(input);
    },
    async sendSignInInput(input) {
      assertOpen();
      signIns.write(input);
    },
    async cancelSignIn(input) {
      assertOpen();
      await signIns.cancel(input);
    },
    async signOut(input) {
      assertOpen();
      if (!harnessKinds.includes(input.harness))
        throw new HarnessError("invalid-harness", "Unknown harness.");
      await signIns.signOut(input);
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
      if (disposal) return disposal;
      disposed = true;
      stopReaper();
      modelDiscovery.abort();
      void signIns.dispose();
      disposal = (async () => {
        const pending = [...opening.values()];
        for (const entry of pending) cancelOpening(entry.lifecycle);
        const results = await Promise.allSettled([
          ...pending.map(waitForOpeningClose),
          // Do not await an overlapping cancelled open again without its deadline.
          ...[...sessions.values()].flatMap((live) =>
            pending.some((entry) => entry.lifecycle === live) ? [] : [closeSession(live, "closed")],
          ),
        ]);
        sessions.clear();
        listeners.clear();
        await mcp?.close();
        const failure = results.find((entry) => entry.status === "rejected");
        if (failure?.status === "rejected") throw failure.reason;
      })();
      return disposal;
    },
  };
}
