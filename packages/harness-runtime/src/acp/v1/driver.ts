import { HarnessError } from "../../errors.ts";
import { acpAuthRequired, type AcpAuthMethod } from "../api.ts";
import { peerCapabilitiesV1 } from "../capabilities.ts";
import type {
  AcpDriverConnection,
  AcpDriverHandlers,
  AcpInitializeOutcome,
  AcpPromptResult,
  AcpSessionSetup,
  AcpTransport,
  ProtocolDriver,
} from "../driver.ts";
import { configOptionsV1, updateV1 } from "./events.ts";
import { elicitationRequestV1, permissionRequestV1 } from "./requests.ts";
import {
  client,
  McpOverAcpProvider,
  ndJsonStream,
  PROTOCOL_VERSION,
  type AuthMethod,
  type ClientCapabilities,
  type ClientConnection,
  type InitializeResponse,
  type NewSessionRequest,
  type NewSessionResponse,
  type PromptResponse,
  type SendRequestOptions,
} from "@agentclientprotocol/sdk/unstable";
import { z } from "zod";

/** auth_required in ACP's ErrorCode (dist/v1/unstable/schema/types.gen.d.ts:3273). */
const authRequiredCode = -32000;
/** RequestError.unsupportedProtocolVersion (dist/core/jsonrpc.d.ts) lists data.supported. */
const unsupportedVersion = z.object({
  code: z.literal(-32022),
  data: z.object({ supported: z.array(z.int()) }).catch({ supported: [] }),
});
const errorWithCode = z.object({ code: z.number() });
const terminalMethod = z.object({ type: z.literal("terminal") });
const steerMethod = "_session/steering";
const steerResponse = z.object({ outcome: z.string() });

/**
 * Advertised client capabilities, from dist/v1/unstable/schema/types.gen.d.ts:
 * elicitation.form (:5230), session.compaction (:4910), session.notices (:4924),
 * session.configOptions.boolean (:4981), auth.terminal (:5208). No fs or terminal methods.
 * Notices are accepted and ignored: they are live hints, not part of a turn.
 */
const clientCapabilities: ClientCapabilities = {
  elicitation: { form: {} },
  session: { compaction: {}, notices: {}, configOptions: { boolean: {} } },
  auth: { terminal: true },
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
    // The agent's output can end before or after its exit event: either way the connection is
    // gone, and the cause keeps the exit reason when there is one.
    if (closed?.aborted)
      throw new HarnessError("disconnected", "The ACP connection closed.", { cause: error });
    if (error instanceof HarnessError) throw error;
    if (errorWithCode.safeParse(error).data?.code === authRequiredCode)
      throw new HarnessError(acpAuthRequired, "Sign in to the agent first.", { cause: error });
    const message = error instanceof Error ? error.message : "ACP request failed.";
    throw new HarnessError("native-request", message, { cause: error });
  }
}

function authMethodsV1(methods: AuthMethod[] | undefined): AcpAuthMethod[] {
  return (methods ?? []).map((method) => {
    const mapped: AcpAuthMethod = { id: method.id, name: method.name, type: "agent" };
    if (method.description) mapped.description = method.description;
    // A method without type is an agent method (AuthMethod, types.gen.d.ts:2128-2136).
    if ("type" in method && terminalMethod.safeParse(method).success) {
      mapped.type = "terminal";
      if (method.args) mapped.args = method.args;
      if (method.env) mapped.env = method.env;
    }
    return mapped;
  });
}

function setupV1(setup: AcpSessionSetup): NewSessionRequest {
  const request: NewSessionRequest = {
    cwd: setup.cwd,
    mcpServers: setup.mcpServers.map((server) => {
      switch (server.type) {
        case "http":
          return { type: "http", name: server.name, url: server.url, headers: server.headers };
        // McpServerAcp (dist/v1/unstable/schema/types.gen.d.ts:5517, :5609).
        case "acp":
          return { type: "acp", name: server.name, serverId: server.serverId };
        case "stdio":
          return { name: server.name, command: server.command, args: server.args, env: server.env };
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

function promptResult(response: PromptResponse): AcpPromptResult {
  const result: AcpPromptResult = { stopReason: response.stopReason };
  const usage = response.usage;
  if (usage) {
    result.usage = { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens };
    if (usage.cachedReadTokens != null) result.usage.cachedInputTokens = usage.cachedReadTokens;
  }
  return result;
}

function connectionV1(
  connection: ClientConnection,
  initialized: InitializeResponse,
  mcp: McpOverAcpProvider,
): AcpDriverConnection {
  const agent = connection.agent;
  const call = <T>(run: () => Promise<T>) => native(run, connection.signal);
  const driverConnection: AcpDriverConnection = {
    protocolVersion: 1,
    capabilities: peerCapabilitiesV1(initialized),
    authMethods: authMethodsV1(initialized.authMethods),
    closed: connection.closed,
    newSession: (setup, signal) =>
      call(async () => {
        const created: NewSessionResponse = await agent.request(
          "session/new",
          setupV1(setup),
          bounded(signal),
        );
        return {
          sessionId: created.sessionId,
          configOptions: configOptionsV1(created.configOptions),
        };
      }),
    loadSession: (sessionId, setup, signal) =>
      call(async () => {
        const loaded = await agent.request(
          "session/load",
          { sessionId, ...setupV1(setup) },
          bounded(signal),
        );
        return { sessionId, configOptions: configOptionsV1(loaded.configOptions) };
      }),
    resumeSession: (sessionId, setup, signal) =>
      call(async () => {
        const resumed = await agent.request(
          "session/resume",
          { sessionId, ...setupV1(setup) },
          bounded(signal),
        );
        return { sessionId, configOptions: configOptionsV1(resumed.configOptions) };
      }),
    closeSession: (sessionId, signal) =>
      call(async () => {
        await agent.request("session/close", { sessionId }, bounded(signal));
      }),
    deleteSession: (sessionId, signal) =>
      call(async () => {
        await agent.request("session/delete", { sessionId }, bounded(signal));
      }),
    sessionOptions: (cwd, signal) =>
      call(async () => {
        const options = await agent.request("session/options", { cwd }, bounded(signal));
        return configOptionsV1(options.configOptions);
      }),
    setConfigOption: (sessionId, configId, value, signal) =>
      call(async () => {
        const updated = await agent.request(
          "session/set_config_option",
          value.type === "boolean"
            ? { sessionId, configId, type: "boolean", value: value.value }
            : { sessionId, configId, value: value.value },
          bounded(signal),
        );
        return configOptionsV1(updated.configOptions);
      }),
    prompt: (sessionId, text) =>
      call(async () =>
        promptResult(
          await agent.request("session/prompt", { sessionId, prompt: [{ type: "text", text }] }),
        ),
      ),
    cancel: (sessionId) => call(() => agent.notify("session/cancel", { sessionId })),
    // claude-agent-acp 0.109.0 dist/v1/steering.js:19-40 and acp-agent.js:1560: with
    // idleBehavior "promptRequired" an idle session returns promptRequired instead of
    // starting a detached turn.
    steer: (sessionId, text) =>
      call(async () => {
        const response = steerResponse.safeParse(
          await agent.request(steerMethod, {
            sessionId,
            prompt: [{ type: "text", text }],
            _meta: { steering: { idleBehavior: "promptRequired" } },
          }),
        );
        if (!response.success)
          throw new HarnessError("invalid-protocol", "Steering returned no outcome.");
        return response.data.outcome;
      }),
    authenticate: (methodId, signal) =>
      call(async () => {
        await agent.request("authenticate", { methodId }, bounded(signal));
      }),
    logout: (signal) =>
      call(async () => {
        await agent.request("logout", {}, bounded(signal));
      }),
    provideMcpServer: (name, handler) => {
      const registration = mcp.registerServer(agent, { name, handler });
      return { declaration: registration.declaration, dispose: () => registration.dispose() };
    },
    close: (error) => connection.close(error),
  };
  if (initialized.agentInfo)
    return {
      ...driverConnection,
      agentInfo: { name: initialized.agentInfo.name, version: initialized.agentInfo.version },
    };
  return driverConnection;
}

async function initialize(
  transport: AcpTransport,
  handlers: AcpDriverHandlers,
  signal: AbortSignal,
): Promise<AcpInitializeOutcome> {
  // Serves servers registered through provideMcpServer; unknown serverIds fail with -33001
  // (dist/mcp/core.d.ts McpBindingErrorCode.serverUnavailable).
  const mcp = new McpOverAcpProvider();
  const app = client({ name: "substrate" })
    .onRequest("mcp/message", mcp.handleRequest)
    .onNotification("session/update", ({ params }) => {
      const update = updateV1(params.update);
      if (update) handlers.update(params.sessionId, update);
    })
    .onRequest("session/request_permission", ({ params, signal: request }) =>
      handlers.request(permissionRequestV1(params), request),
    )
    // Only form mode is advertised; anything else gets the no-ask answer.
    .onRequest("elicitation/create", ({ params, signal: request }) =>
      params.mode === "form"
        ? handlers.request(elicitationRequestV1(params), request)
        : { action: "decline" },
    );
  const connection = app.connect(ndJsonStream(transport.output, transport.input));
  let initialized: InitializeResponse;
  try {
    initialized = await connection.agent.request(
      "initialize",
      {
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities,
        clientInfo: { name: "substrate", version: "1.0.0" },
      },
      bounded(signal),
    );
  } catch (error) {
    connection.close();
    const rejected = unsupportedVersion.safeParse(error);
    if (rejected.success) return { type: "retry", versions: rejected.data.data.supported };
    return native(() => Promise.reject(error));
  }
  if (initialized.protocolVersion !== PROTOCOL_VERSION) {
    connection.close();
    return { type: "retry", versions: [initialized.protocolVersion] };
  }
  return { type: "ready", connection: connectionV1(connection, initialized, mcp) };
}

export const v1Driver: ProtocolDriver = { version: 1, initialize };
