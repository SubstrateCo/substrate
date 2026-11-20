import { HarnessError } from "../../errors.ts";
import { acpAuthRequired, type AcpAuthMethod } from "../api.ts";
import { peerCapabilitiesV2 } from "../capabilities.ts";
import type {
  AcpDriverConnection,
  AcpDriverHandlers,
  AcpInitializeOutcome,
  AcpSessionOpened,
  AcpSessionSetup,
  AcpTransport,
  ProtocolDriver,
} from "../driver.ts";
import { commandNamesV2, configOptionsV2, SessionUpdatesV2 } from "./events.ts";
import { elicitationRequestV2, permissionRequestV2 } from "./requests.ts";
import { SessionTurns } from "./turns.ts";
import {
  AuthMethod,
  client,
  McpOverAcpProvider,
  ndJsonStream,
  PROTOCOL_VERSION,
  SessionUpdate,
  type AnyMessage,
  type AvailableCommand,
  type ClientCapabilities,
  type ClientConnection,
  type InitializeResponse,
  type NewSessionRequest,
  type SendRequestOptions,
  type SessionConfigOption,
} from "@agentclientprotocol/sdk/experimental/v2/unstable";
import { z } from "zod";

/** auth_required in ACP's ErrorCode (dist/v2/unstable/schema/types.gen.d.ts ErrorCode). */
const authRequiredCode = -32000;
/** RequestError.unsupportedProtocolVersion (dist/core/jsonrpc.d.ts:583) lists data.supported. */
const unsupportedVersion = z.object({
  code: z.literal(-32022),
  data: z.object({ supported: z.array(z.int()) }).catch({ supported: [] }),
});
const errorWithCode = z.object({ code: z.number() });
/** The first response on the connection answers initialize. */
const initializeResult = z.object({
  id: z.union([z.string(), z.number()]),
  result: z.object({ protocolVersion: z.int() }),
});

/**
 * Advertised client capabilities, from dist/v2/unstable/schema/types.gen.d.ts:
 * elicitation.form (:6087) and auth.terminal (:6046). v2 has no fs or terminal methods, and
 * compaction, notices and boolean config options need no client marker.
 */
const clientCapabilities: ClientCapabilities = {
  elicitation: { form: {} },
  auth: { terminal: {} },
};

const bounded = (signal: AbortSignal): SendRequestOptions => ({
  cancellationSignal: signal,
  stopWaitingOnCancel: true,
});

/** Maps SDK errors to HarnessErrors. closed: the connection's signal, aborted once it ends. */
async function native<T>(run: () => Promise<T>, closed?: AbortSignal): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (closed?.aborted)
      throw new HarnessError("disconnected", "The ACP connection closed.", { cause: error });
    if (error instanceof HarnessError) throw error;
    if (errorWithCode.safeParse(error).data?.code === authRequiredCode)
      throw new HarnessError(acpAuthRequired, "Sign in to the agent first.", { cause: error });
    const message = error instanceof Error ? error.message : "ACP request failed.";
    throw new HarnessError("native-request", message, { cause: error });
  }
}

/** Custom and future method types are skipped: the client cannot run them. */
function authMethodsV2(methods: AuthMethod[] | undefined): AcpAuthMethod[] {
  const mapped: AcpAuthMethod[] = [];
  for (const method of methods ?? []) {
    let entry: AcpAuthMethod;
    if (AuthMethod.isAgent(method))
      entry = { id: method.methodId, name: method.name, type: "agent" };
    else if (AuthMethod.isTerminal(method)) {
      entry = { id: method.methodId, name: method.name, type: "terminal" };
      if (method.args) entry.args = method.args;
      // v2 env is a list; the last entry with a name wins (AuthMethodTerminal.env :2665).
      if (method.env)
        entry.env = Object.fromEntries(
          method.env.map((variable) => [variable.name, variable.value]),
        );
    } else continue;
    if (method.description) entry.description = method.description;
    mapped.push(entry);
  }
  return mapped;
}

function setupV2(setup: AcpSessionSetup): NewSessionRequest {
  const request: NewSessionRequest = {
    cwd: setup.cwd,
    // McpServer (types.gen.d.ts:6587): every variant carries type, stdio included.
    mcpServers: setup.mcpServers.map((server) => {
      switch (server.type) {
        case "http":
          return { type: "http", name: server.name, url: server.url, headers: server.headers };
        case "acp":
          return { type: "acp", name: server.name, serverId: server.serverId };
        case "stdio":
          return {
            type: "stdio",
            name: server.name,
            command: server.command,
            args: server.args,
            env: server.env,
          };
      }
    }),
  };
  if (setup.systemPrompt)
    request.systemPrompt = {
      mode: "append",
      content: [{ type: "text", text: setup.systemPrompt }],
    };
  return request;
}

/** Per-session reducers and turns, created on the first traffic for a session. */
class Sessions {
  private readonly entries = new Map<string, { updates: SessionUpdatesV2; turns: SessionTurns }>();

  get(sessionId: string) {
    let entry = this.entries.get(sessionId);
    if (!entry) {
      const updates = new SessionUpdatesV2();
      entry = { updates, turns: new SessionTurns(() => updates.endTurn()) };
      this.entries.set(sessionId, entry);
    }
    return entry;
  }

  drop(sessionId: string, error: Error) {
    this.entries.get(sessionId)?.turns.fail(error);
    this.entries.delete(sessionId);
  }

  failAll(error: Error) {
    for (const entry of this.entries.values()) entry.turns.fail(error);
  }
}

function connectionV2(
  connection: ClientConnection,
  initialized: InitializeResponse,
  sessions: Sessions,
  handlers: AcpDriverHandlers,
  mcp: McpOverAcpProvider,
): AcpDriverConnection {
  const agent = connection.agent;
  const call = <T>(run: () => Promise<T>) => native(run, connection.signal);
  const disconnected = () => new HarnessError("disconnected", "The ACP connection closed.");
  void connection.closed.then(() => sessions.failAll(disconnected()));
  /** A setup response replaces the command list the client holds (types.gen.d.ts:3039). */
  const opened = (
    sessionId: string,
    response: { configOptions?: SessionConfigOption[]; availableCommands?: AvailableCommand[] },
  ): AcpSessionOpened => {
    handlers.update(sessionId, {
      type: "commands",
      names: commandNamesV2(response.availableCommands),
    });
    return { sessionId, configOptions: configOptionsV2(response.configOptions) };
  };
  const prompt = (sessionId: string, text: string) => (signal?: AbortSignal) =>
    agent.request(
      "session/prompt",
      { sessionId, prompt: [{ type: "text", text }] },
      signal ? { cancellationSignal: signal } : undefined,
    );
  const driverConnection: AcpDriverConnection = {
    protocolVersion: 2,
    capabilities: peerCapabilitiesV2(initialized),
    authMethods: authMethodsV2(initialized.authMethods),
    agentInfo: { name: initialized.info.name, version: initialized.info.version },
    closed: connection.closed,
    newSession: (setup, signal) =>
      call(async () => {
        const created = await agent.request("session/new", setupV2(setup), bounded(signal));
        sessions.get(created.sessionId);
        return opened(created.sessionId, created);
      }),
    // v2 has no session/load: resume with a replay from the start (ReplayFrom :7307).
    loadSession: (sessionId, setup, signal) =>
      call(async () => {
        sessions.get(sessionId);
        const resumed = await agent.request(
          "session/resume",
          { sessionId, ...setupV2(setup), replayFrom: { type: "start" } },
          bounded(signal),
        );
        return opened(sessionId, resumed);
      }),
    resumeSession: (sessionId, setup, signal) =>
      call(async () => {
        sessions.get(sessionId);
        const resumed = await agent.request(
          "session/resume",
          { sessionId, ...setupV2(setup) },
          bounded(signal),
        );
        return opened(sessionId, resumed);
      }),
    closeSession: (sessionId, signal) =>
      call(async () => {
        await agent.request("session/close", { sessionId }, bounded(signal));
        sessions.drop(sessionId, new HarnessError("disconnected", "The ACP session closed."));
      }),
    deleteSession: (sessionId, signal) =>
      call(async () => {
        await agent.request("session/delete", { sessionId }, bounded(signal));
        sessions.drop(sessionId, new HarnessError("disconnected", "The ACP session was deleted."));
      }),
    sessionOptions: (cwd, signal) =>
      call(async () => {
        const options = await agent.request("session/options", { cwd }, bounded(signal));
        return configOptionsV2(options.configOptions);
      }),
    setConfigOption: (sessionId, configId, value, signal) =>
      call(async () => {
        const updated = await agent.request(
          "session/set_config_option",
          value.type === "boolean"
            ? { sessionId, configId, type: "boolean", value: value.value }
            : { sessionId, configId, type: "id", value: value.value },
          bounded(signal),
        );
        return configOptionsV2(updated.configOptions);
      }),
    // The turn ends with the idle state_update, not the prompt response (see turns.ts).
    prompt: (sessionId, text) =>
      call(() => sessions.get(sessionId).turns.prompt(prompt(sessionId, text))),
    cancel: (sessionId) => call(() => agent.notify("session/cancel", { sessionId })),
    // Native steering: a prompt during the turn joins it. Without a turn the agent would
    // start a detached one, so nothing is sent.
    steer: (sessionId, text) =>
      call(() => sessions.get(sessionId).turns.steer(prompt(sessionId, text))),
    authenticate: (methodId, signal) =>
      call(async () => {
        await agent.request("auth/login", { methodId }, bounded(signal));
      }),
    logout: (signal) =>
      call(async () => {
        await agent.request("auth/logout", {}, bounded(signal));
      }),
    provideMcpServer: (name, handler) => {
      const registration = mcp.registerServer(agent, { name, handler });
      return { declaration: registration.declaration, dispose: () => registration.dispose() };
    },
    close: (error) => connection.close(error),
  };
  return driverConnection;
}

async function initialize(
  transport: AcpTransport,
  handlers: AcpDriverHandlers,
  signal: AbortSignal,
): Promise<AcpInitializeOutcome> {
  const sessions = new Sessions();
  // Serves servers registered through provideMcpServer; unknown serverIds fail with -33001
  // (dist/mcp/core.d.ts McpBindingErrorCode.serverUnavailable).
  const mcp = new McpOverAcpProvider();
  const app = client({ name: "substrate" })
    .onRequest("mcp/message", mcp.handleRequest)
    .onNotification("session/update", ({ params }) => {
      const update = params.update;
      const session = sessions.get(params.sessionId);
      if (SessionUpdate.isStateUpdate(update)) session.turns.onState(update);
      else if (SessionUpdate.isUserMessage(update) || SessionUpdate.isUserMessageChunk(update))
        session.turns.onUserMessage(update.messageId);
      const reduced = session.updates.reduce(update);
      if (reduced) handlers.update(params.sessionId, reduced);
    })
    .onRequest("session/request_permission", ({ params, signal: request }) =>
      handlers.request(permissionRequestV2(params), request),
    )
    // Only form mode is advertised; anything else gets the no-ask answer.
    .onRequest("elicitation/create", ({ params, signal: request }) =>
      params.mode === "form"
        ? handlers.request(elicitationRequestV2(params), request)
        : { action: "decline" },
    );
  // A v1 agent answers a v2 initialize with protocolVersion 1 and a v1 result, which the v2
  // SDK rejects before returning it, so the offered version is read off the wire.
  const wire = ndJsonStream(transport.output, transport.input);
  let offered: number | undefined;
  const readable = wire.readable.pipeThrough(
    new TransformStream<AnyMessage, AnyMessage>({
      transform(message, controller) {
        if (offered === undefined) {
          const parsed = initializeResult.safeParse(message);
          if (parsed.success) offered = parsed.data.result.protocolVersion;
        }
        controller.enqueue(message);
      },
    }),
  );
  const connection = app.connect({ writable: wire.writable, readable });
  let initialized: InitializeResponse;
  try {
    const snapshot = connection.agent.request(
      "initialize",
      {
        protocolVersion: PROTOCOL_VERSION,
        info: { name: "substrate", version: "1.0.0" },
        capabilities: clientCapabilities,
      },
      bounded(signal),
    );
    initialized = await snapshot;
  } catch (error) {
    connection.close();
    if (offered !== undefined && offered !== PROTOCOL_VERSION)
      return { type: "retry", versions: [offered] };
    const rejected = unsupportedVersion.safeParse(error);
    if (rejected.success) return { type: "retry", versions: rejected.data.data.supported };
    return native(() => Promise.reject(error));
  }
  return {
    type: "ready",
    connection: connectionV2(connection, initialized, sessions, handlers, mcp),
  };
}

export const v2Driver: ProtocolDriver = { version: 2, initialize };
