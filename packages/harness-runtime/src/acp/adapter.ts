import type {
  AdapterCapabilities,
  HarnessMcpServer,
  TurnInput,
  TurnResult,
  Usage,
} from "@substrate/contracts/harness";

import { PendingRequests } from "../adapters/requests.ts";
import { toolInput, toolLabel } from "../adapters/tool-label.ts";
import type { AdapterContext, NativeAdapter, TurnOptions } from "../adapters/types.ts";
import { HarnessError, unsupported } from "../errors.ts";
import type { JsonValue } from "../json.ts";
import type { AcpConfigOption, AcpConnectOptions } from "./api.ts";
import { adapterCapabilities } from "./capabilities.ts";
import { connectAcp, type AcpConnectDeps, type AcpLiveConnection } from "./connection.ts";
import type {
  AcpClientRequest,
  AcpDriverConnection,
  AcpDriverHandlers,
  AcpMcpRegistration,
  AcpMcpServer,
  AcpMcpServerAcp,
  AcpSessionOpened,
  AcpSessionSetup,
  AcpUpdate,
} from "./driver.ts";
import { acpToolServer, substrateMcpName, type AcpToolServer } from "./mcp-provider.ts";
import { setTimeout } from "node:timers/promises";

export interface AcpAdapterDeps extends AcpConnectDeps {
  /**
   * After setup, how long to wait for the first available_commands_update, so the
   * capabilities the host records at open already show compact.
   */
  commandsWaitMs?: number;
}

const setupTimeoutMs = 30_000;
const closeTimeoutMs = 5_000;

interface LiveTurn {
  mode: TurnOptions["mode"];
  consumed: string[];
  usage?: Usage;
  interrupted: boolean;
}

/** substrate: the lease's MCP-over-ACP declaration; without it the lease goes over HTTP. */
export function acpMcpServers(
  context: AdapterContext,
  substrate?: AcpMcpServerAcp,
): AcpMcpServer[] {
  const servers: AcpMcpServer[] = [];
  if (substrate) servers.push(substrate);
  else if (context.lease)
    servers.push({
      type: "http",
      name: substrateMcpName,
      url: context.lease.url,
      headers: [{ name: "Authorization", value: `Bearer ${context.lease.token}` }],
    });
  for (const server of context.mcpServers ?? []) servers.push(userServer(server));
  return servers;
}

function userServer(server: HarnessMcpServer): AcpMcpServer {
  if (server.transport === "http")
    return { type: "http", name: server.name, url: server.url, headers: [] };
  return {
    type: "stdio",
    name: server.name,
    command: server.command,
    args: server.args ?? [],
    env: Object.entries(server.environment ?? {}).map(([name, value]) => ({ name, value })),
  };
}

/** An identifier-like title is a raw tool name, such as mcp__substrate__list_tasks. */
function toolTitle(update: Extract<AcpUpdate, { type: "tool" }>) {
  const input = toolInput.parse(update.rawInput);
  if (update.name) return toolLabel(update.name, input);
  const title = update.title?.trim();
  if (!title) return "Tool";
  return /^[\w.-]+$/.test(title) ? toolLabel(title, input) : title.slice(0, 120);
}

/** Maps one ACP session onto host turns. */
class AcpSession {
  private readonly requests = new PendingRequests();
  /** Requests waiting for the host, by request ID; answers holds parsed responses. */
  private readonly open = new Map<string, AcpClientRequest<unknown>>();
  private readonly answers = new Map<string, unknown>();
  private readonly commands = new Set<string>();
  private readonly started = new Set<string>();
  private readonly finished = new Set<string>();
  /** Updates that arrived before session/new answered with the session ID. */
  private early: { sessionId: string; update: AcpUpdate }[] | undefined = [];
  private commandsSeen = Promise.withResolvers<void>();
  private live: AcpLiveConnection | undefined;
  private sessionId = "";
  private configOptions: AcpConfigOption[] = [];
  private turnState: LiveTurn | undefined;
  private compacting = false;
  /** session/load replays history as updates; none of it is output of ours. */
  private replaying = false;
  private closed = false;
  private text = "";
  private messageId: string | undefined;
  /** The lease's tools served over `mcp/message`, when the agent takes MCP-over-ACP. */
  private tools: { server: AcpToolServer; registration: AcpMcpRegistration } | undefined;

  constructor(private readonly context: AdapterContext) {}

  readonly handlers: AcpDriverHandlers = {
    update: (sessionId, update) => {
      if (this.early) this.early.push({ sessionId, update });
      else if (sessionId === this.sessionId) this.update(update);
    },
    request: (request, signal) => this.request(request, signal),
  };

  private get connection(): AcpDriverConnection {
    if (!this.live) throw new HarnessError("not-connected", "The ACP session is not open.");
    return this.live.connection;
  }

  private scope() {
    return this.turnState ? "turn" : "session";
  }

  private flush() {
    if (this.text.trim()) this.context.emit({ type: "text", text: this.text }, this.scope());
    this.text = "";
  }

  private update(update: AcpUpdate) {
    if (update.type === "commands") {
      this.commands.clear();
      for (const name of update.names) this.commands.add(name);
      this.commandsSeen.resolve();
      return;
    }
    if (update.type === "config") {
      this.configOptions = update.options;
      return;
    }
    if (this.replaying) return;
    switch (update.type) {
      case "text":
        if (update.messageId !== this.messageId) {
          this.flush();
          this.messageId = update.messageId;
        }
        this.text += update.text;
        return;
      case "tool":
        this.flush();
        if (!this.started.has(update.toolCallId)) {
          this.started.add(update.toolCallId);
          this.context.emit(
            {
              type: "item.started",
              itemId: update.toolCallId,
              itemType: update.kind ?? "tool",
              title: toolTitle(update),
            },
            this.scope(),
          );
        }
        if (
          (update.status === "completed" || update.status === "failed") &&
          !this.finished.has(update.toolCallId)
        ) {
          this.finished.add(update.toolCallId);
          this.context.emit(
            { type: "item.completed", itemId: update.toolCallId, status: update.status },
            this.scope(),
          );
        }
        return;
      case "usage": {
        const usage: Usage = { contextUsed: update.used, contextWindow: update.size };
        if (this.turnState) this.turnState.usage = { ...this.turnState.usage, ...usage };
        this.context.emit({ type: "usage.updated", usage }, this.scope());
        return;
      }
      case "compaction":
        if (update.status === "completed") {
          this.flush();
          this.context.emit({ type: "compaction" }, this.scope());
        }
        return;
    }
  }

  private async request<R>(request: AcpClientRequest<R>, signal: AbortSignal): Promise<R> {
    if (this.closed) return request.cancelled();
    if (
      request.sessionId !== this.sessionId ||
      !this.turnState ||
      this.turnState.mode === "unattended"
    )
      return request.deny();
    this.flush();
    let requestId: string | undefined;
    try {
      await this.requests.request((id) => {
        requestId = id;
        this.open.set(id, request);
        this.context.emit(
          { type: "request.opened", kind: request.kind, requestId: id, data: request.data },
          "turn",
        );
      }, signal);
      // SAFETY: respond stores only the result of this request's own parse.
      return this.answers.get(requestId!) as R;
    } catch {
      return request.cancelled();
    } finally {
      if (requestId) {
        this.open.delete(requestId);
        this.answers.delete(requestId);
      }
    }
  }

  async setup(live: AcpLiveConnection, options: AcpConnectOptions, deps: AcpAdapterDeps) {
    this.live = live;
    const connection = live.connection;
    const capabilities = connection.capabilities;
    const { context } = options;
    // Prefer MCP-over-ACP when the agent advertises it: no loopback port or bearer token.
    const endpoint = context.lease?.endpoint;
    if (endpoint && capabilities.mcp.acp && connection.provideMcpServer) {
      const server = acpToolServer(endpoint);
      this.tools = {
        server,
        registration: connection.provideMcpServer(substrateMcpName, server.handler),
      };
    }
    const mcpServers = acpMcpServers(context, this.tools?.registration.declaration);
    if (mcpServers.some((server) => server.type === "http") && !capabilities.mcp.http)
      unsupported(`Installed ${options.launch.harness} does not advertise ACP HTTP MCP support.`);
    const setup: AcpSessionSetup = { cwd: context.directory, mcpServers };
    if (options.prefixChannel === "systemPrompt") {
      if (!capabilities.systemPrompt.append)
        unsupported(`Installed ${options.launch.harness} does not accept an ACP system prompt.`);
      if (options.prefix) setup.systemPrompt = options.prefix;
    }
    const signal = () => AbortSignal.timeout(setupTimeoutMs);
    let opened: AcpSessionOpened;
    if (options.resumeId) {
      this.sessionId = options.resumeId;
      this.early = undefined;
      if (capabilities.resume)
        opened = await connection.resumeSession(options.resumeId, setup, signal());
      else if (capabilities.loadSession) {
        this.replaying = true;
        try {
          opened = await connection.loadSession(options.resumeId, setup, signal());
        } finally {
          this.replaying = false;
        }
      } else unsupported(`Installed ${options.launch.harness} cannot resume ACP sessions.`);
    } else {
      opened = await connection.newSession(setup, signal());
      this.sessionId = opened.sessionId;
      const early = this.early ?? [];
      this.early = undefined;
      for (const entry of early) if (entry.sessionId === this.sessionId) this.update(entry.update);
    }
    if (!this.configOptions.length) this.configOptions = opened.configOptions;
    if (context.model) await this.selectModel(context.model, signal());
    const wait = deps.commandsWaitMs ?? 1_000;
    if (wait > 0 && !this.commands.size)
      await Promise.race([this.commandsSeen.promise, setTimeout(wait)]);
    void connection.closed.then(() => this.lost());
  }

  private async selectModel(model: string, signal: AbortSignal) {
    const option = this.configOptions.find((entry) => entry.category === "model");
    if (!option) unsupported("The agent offers no model option.");
    if (option.type !== "select" || !option.values.some((value) => value.value === model))
      throw new HarnessError("invalid-model", `The agent does not offer model ${model}.`);
    this.configOptions = await this.connection.setConfigOption(
      this.sessionId,
      option.id,
      { type: "select", value: model },
      signal,
    );
  }

  /** Stops serving the lease over ACP. The lease itself belongs to the host. */
  async releaseTools() {
    const tools = this.tools;
    this.tools = undefined;
    if (!tools) return;
    // dispose waits for active requests to settle, and an agent such as Claude Code holds a
    // subscriptions/listen stream open until the server closes. Close the server alongside it
    // so the stream ends, and bound both so teardown never blocks the session's close.
    await Promise.race([
      Promise.allSettled([tools.server.close(), tools.registration.dispose()]),
      setTimeout(closeTimeoutMs),
    ]);
  }

  /** The connection ended without disconnect: the agent exited or closed its output. */
  private lost() {
    if (this.closed) return;
    this.closed = true;
    this.requests.cancel();
    void this.releaseTools();
    this.context.emit(
      { type: "error", code: "disconnected", message: "The ACP agent connection ended." },
      "session",
    );
  }

  private async turn(input: TurnInput, options: TurnOptions): Promise<TurnResult> {
    if (this.closed) throw new HarnessError("disconnected", "The ACP agent connection ended.");
    if (this.turnState || this.compacting)
      throw new HarnessError("turn-active", "A turn is already running.");
    const turn: LiveTurn = {
      mode: options.mode,
      consumed: [...input.inputIds],
      interrupted: false,
    };
    this.turnState = turn;
    try {
      const response = await this.connection.prompt(this.sessionId, input.text);
      this.flush();
      const result: TurnResult = {
        status: response.stopReason === "cancelled" ? "interrupted" : "completed",
        consumedInputIds: turn.consumed,
      };
      const usage = { ...response.usage, ...turn.usage };
      if (Object.keys(usage).length) result.usage = usage;
      return result;
    } catch (error) {
      this.flush();
      if (turn.interrupted) return { status: "interrupted", consumedInputIds: turn.consumed };
      return {
        status: "failed",
        error: error instanceof Error ? error.message : "ACP turn failed.",
      };
    } finally {
      this.turnState = undefined;
      this.requests.cancel();
    }
  }

  private async steer(input: { inputId: string; text: string }) {
    const turn = this.turnState;
    if (!turn) throw new HarnessError("turn-not-live", "No turn is running.");
    const outcome = await this.connection.steer(this.sessionId, input.text);
    if (outcome === "promptRequired")
      throw new HarnessError("turn-not-live", "The turn ended before the input arrived.");
    if (outcome !== "injected")
      throw new HarnessError("native-request", `Steering returned ${outcome}.`);
    turn.consumed.push(input.inputId);
    this.context.emit({ type: "input.consumed", inputId: input.inputId }, "turn");
  }

  private async compact() {
    if (!this.commands.has("compact"))
      throw new HarnessError("compact-unsupported", "This agent lists no compact command.");
    if (this.turnState || this.compacting)
      throw new HarnessError("turn-active", "Compact between turns.");
    this.compacting = true;
    try {
      await this.connection.prompt(this.sessionId, "/compact");
      this.flush();
    } finally {
      this.compacting = false;
    }
  }

  private async interrupt() {
    this.requests.cancel();
    const turn = this.turnState;
    if (turn) {
      turn.interrupted = true;
      await this.connection.cancel(this.sessionId);
    }
    return {};
  }

  private respond(requestId: string, response: JsonValue | undefined) {
    const request = this.open.get(requestId);
    if (request) this.answers.set(requestId, request.parse(response));
    this.requests.respond(requestId, null);
  }

  private async disconnect() {
    if (!this.live) return;
    const live = this.live;
    const wasClosed = this.closed;
    this.closed = true;
    this.requests.cancel();
    if (!wasClosed && live.connection.capabilities.close)
      await live.connection
        .closeSession(this.sessionId, AbortSignal.timeout(closeTimeoutMs))
        .catch(() => {});
    await this.releaseTools();
    await live.close();
  }

  adapter(): NativeAdapter {
    const connection = this.connection;
    const commands = this.commands;
    const adapter: NativeAdapter = {
      get capabilities(): AdapterCapabilities {
        return adapterCapabilities(connection.capabilities, commands);
      },
      nativeSessionId: this.sessionId,
      turn: (input, options) => this.turn(input, options),
      compact: () => this.compact(),
      interrupt: () => this.interrupt(),
      respond: async (requestId, response) => this.respond(requestId, response),
      disconnect: () => this.disconnect(),
      closed: connection.closed,
    };
    if (connection.capabilities.steering !== "none") adapter.steer = (input) => this.steer(input);
    return adapter;
  }
}

/** Starts the agent, opens or resumes its session, and returns the host's adapter. */
export async function createAcpAdapter(
  options: AcpConnectOptions,
  deps: AcpAdapterDeps = {},
): Promise<NativeAdapter> {
  const session = new AcpSession(options.context);
  const live = await connectAcp(
    options.launch,
    options.context.directory,
    session.handlers,
    AbortSignal.timeout(setupTimeoutMs),
    deps,
  );
  try {
    await session.setup(live, options, deps);
  } catch (error) {
    await session.releaseTools();
    await live.close();
    throw error;
  }
  return session.adapter();
}
