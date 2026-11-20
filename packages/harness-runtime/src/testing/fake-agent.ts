/**
 * A scriptable ACP v1 agent for tests, built with the SDK's agent() app. With 2 in
 * protocolVersions it also speaks v2 (fake-agent-v2.ts). Run it in-process with
 * startFakeAgent, or as a stdio process: `bun fake-agent.ts` with the script as JSON in
 * FAKE_ACP_SCRIPT.
 */
import type { AcpProcess } from "../acp/connection.ts";
import type { JsonValue } from "../json.ts";
import {
  fakeAgentAppV2,
  type FakeV2Answers,
  type FakeV2Options,
  type FakeV2Step,
} from "./fake-agent-v2.ts";
import {
  agentProtocolRouter,
  type AgentConnector,
  type Stream,
} from "@agentclientprotocol/sdk/experimental/v2/unstable";
import {
  agent,
  ndJsonStream,
  RequestError,
  type AgentCapabilities,
  type AgentContext,
  isMcpServerAcp,
  McpOverAcpCaller,
  type AuthMethod,
  type CreateElicitationResponse,
  type McpOutcome,
  type ElicitationSchema,
  type PermissionOption,
  type RequestPermissionResponse,
  type SessionConfigOption,
  type SessionUpdate,
  type StopReason,
  type ToolCallStatus,
  type ToolKind,
  type Usage,
} from "@agentclientprotocol/sdk/unstable";
import { Readable, Writable } from "node:stream";
import { z } from "zod";

export type FakeStep =
  | { text: string; messageId?: string }
  | {
      tool: {
        id: string;
        title: string;
        name?: string;
        kind?: ToolKind;
        rawInput?: unknown;
        status?: ToolCallStatus;
      };
    }
  | { toolDone: { id: string; status: "completed" | "failed" } }
  | FakeV2Step
  | { usage: { used: number; size: number } }
  | { compaction: string }
  | { permission: { toolCallId: string; options?: PermissionOption[] } }
  | { elicitation: { message: string; requestedSchema: ElicitationSchema } }
  /**
   * Sends one inner MCP request over `mcp/message` to the session's ACP-declared server with
   * this name, and records its outcome in record.mcp.
   */
  | { mcp: { server: string; method: string; params?: { [key: string]: JsonValue } } }
  /** Blocks until session/cancel arrives; the prompt then stops with "cancelled". */
  | { waitForCancel: true }
  /** Blocks until a `_session/steering` request arrives. */
  | { waitForSteer: true }
  /** Ends the agent: process.exit in stdio mode, a closed connection in-process. */
  | { exit: number };

export interface FakeAgentScript {
  /** Versions the agent speaks. Default [1]. */
  protocolVersions?: number[];
  /** Answer an unsupported version with -32022 instead of selecting another version. */
  rejectUnsupportedVersion?: boolean;
  agentInfo?: { name: string; version: string };
  agentCapabilities?: AgentCapabilities;
  /** InitializeResponse._meta: the `_session/steering` extension advertisement. */
  meta?: { steering: { supported: boolean } };
  authMethods?: AuthMethod[];
  /** Session setup fails with auth_required until authenticate succeeds. */
  requireAuth?: boolean;
  /** Slash commands, sent in available_commands_update after session setup. */
  commands?: string[];
  configOptions?: SessionConfigOption[];
  /** Steps per prompt text; other prompts run defaultTurn. */
  turns?: Record<string, FakeStep[]>;
  defaultTurn?: FakeStep[];
  stopReason?: StopReason;
  promptUsage?: Usage;
  /** v2 initialize and session data, used when protocolVersions includes 2. */
  v2?: FakeV2Options;
}

/** What the fake agent received and answered. */
export interface FakeAgentRecord {
  calls: { method: string; params: object }[];
  permissions: (RequestPermissionResponse | FakeV2Answers["permission"])[];
  elicitations: (CreateElicitationResponse | FakeV2Answers["elicitation"])[];
  steers: string[];
  /** Inner MCP outcomes, or the outer ACP error of a failed `mcp/message`. */
  mcp: (McpOutcome | { acpError: { code: number; message: string } })[];
}

const acpError = z.object({ code: z.number(), message: z.string() });

function newRecord(): FakeAgentRecord {
  return { calls: [], permissions: [], elicitations: [], steers: [], mcp: [] };
}

const steerRequest = z.object({
  sessionId: z.string(),
  prompt: z.array(z.object({ type: z.string(), text: z.string().optional() })),
});

const permissionOptions: PermissionOption[] = [
  { optionId: "allow", name: "Allow", kind: "allow_once" },
  { optionId: "reject", name: "Reject", kind: "reject_once" },
];

function promptText(prompt: { type: string; text?: string }[]) {
  return prompt.map((block) => (block.type === "text" ? (block.text ?? "") : "")).join("");
}

function fakeAgentApp(
  script: FakeAgentScript,
  record: FakeAgentRecord,
  exit: (code: number) => void,
) {
  const supported = script.protocolVersions ?? [1];
  let authed = !script.requireAuth;
  let sessions = 0;
  let configOptions = structuredClone(script.configOptions ?? []);
  let running: { cancelled: boolean; cancel(): void; steer(): void } | undefined;
  /** ACP-declared MCP servers per session: name to serverId. */
  const acpServers = new Map<string, Map<string, string>>();
  const caller = new McpOverAcpCaller({ clientInfo: { name: "fake-agent", version: "1.0.0" } });
  const declare = (sessionId: string, servers: unknown[]) =>
    acpServers.set(
      sessionId,
      new Map(
        servers.flatMap((server) =>
          isMcpServerAcp(server) ? [[server.name, server.serverId] as const] : [],
        ),
      ),
    );
  const log = <Params extends object>(method: string, params: Params) =>
    record.calls.push({ method, params });
  const send = (client: AgentContext, sessionId: string, update: SessionUpdate) =>
    client.notify("session/update", { sessionId, update });
  const announceCommands = (client: AgentContext, sessionId: string) => {
    if (!script.commands) return;
    const commands = script.commands;
    setTimeout(() => {
      void send(client, sessionId, {
        sessionUpdate: "available_commands_update",
        availableCommands: commands.map((name) => ({ name, description: name })),
      }).catch(() => {});
    }, 0);
  };
  const requireAuth = () => {
    if (!authed) throw RequestError.authRequired();
  };

  async function run(client: AgentContext, sessionId: string, steps: FakeStep[]) {
    const cancel = Promise.withResolvers<void>();
    let steered = Promise.withResolvers<void>();
    const state = {
      cancelled: false,
      cancel: () => {
        state.cancelled = true;
        cancel.resolve();
      },
      steer: () => steered.resolve(),
    };
    running = state;
    try {
      for (const step of steps) {
        if (state.cancelled) break;
        if ("text" in step)
          await send(client, sessionId, {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: step.text },
            messageId: step.messageId,
          });
        else if ("tool" in step)
          await send(client, sessionId, {
            sessionUpdate: "tool_call",
            toolCallId: step.tool.id,
            title: step.tool.title,
            name: step.tool.name,
            kind: step.tool.kind,
            rawInput: step.tool.rawInput,
            status: step.tool.status ?? "pending",
          });
        else if ("toolDone" in step)
          await send(client, sessionId, {
            sessionUpdate: "tool_call_update",
            toolCallId: step.toolDone.id,
            status: step.toolDone.status,
          });
        else if ("usage" in step)
          await send(client, sessionId, { sessionUpdate: "usage_update", ...step.usage });
        else if ("compaction" in step)
          await send(client, sessionId, {
            sessionUpdate: "compaction_update",
            compactionId: "compaction-1",
            status: step.compaction,
          });
        else if ("permission" in step)
          record.permissions.push(
            await client.request("session/request_permission", {
              sessionId,
              toolCall: { toolCallId: step.permission.toolCallId, title: "Run tool" },
              options: step.permission.options ?? permissionOptions,
            }),
          );
        else if ("elicitation" in step)
          record.elicitations.push(
            await client.request("elicitation/create", {
              sessionId,
              mode: "form",
              message: step.elicitation.message,
              requestedSchema: step.elicitation.requestedSchema,
            }),
          );
        else if ("mcp" in step) {
          const serverId = acpServers.get(sessionId)?.get(step.mcp.server) ?? step.mcp.server;
          try {
            record.mcp.push(
              await caller.request(client, serverId, step.mcp.method, step.mcp.params),
            );
          } catch (error) {
            const parsed = acpError.safeParse(error);
            record.mcp.push({
              acpError: parsed.success
                ? { code: parsed.data.code, message: parsed.data.message }
                : { code: 0, message: String(error) },
            });
          }
        } else if ("waitForCancel" in step) await cancel.promise;
        else if ("waitForSteer" in step) {
          await Promise.race([steered.promise, cancel.promise]);
          steered = Promise.withResolvers<void>();
        } else if ("exit" in step) {
          exit(step.exit);
          await new Promise(() => {});
        }
      }
    } finally {
      running = undefined;
    }
    return state.cancelled;
  }

  return agent({ name: "fake-agent" })
    .onRequest("initialize", ({ params }) => {
      log("initialize", params);
      const requested = params.protocolVersion;
      let version = requested;
      if (!supported.includes(requested)) {
        if (script.rejectUnsupportedVersion)
          throw RequestError.unsupportedProtocolVersion(requested, supported);
        version = Math.max(...supported);
      }
      return {
        protocolVersion: version,
        agentCapabilities: script.agentCapabilities ?? {},
        authMethods: script.authMethods ?? [],
        agentInfo: script.agentInfo ?? { name: "fake-agent", version: "1.0.0" },
        _meta: script.meta ?? null,
      };
    })
    .onRequest("authenticate", ({ params }) => {
      log("authenticate", params);
      authed = true;
      return {};
    })
    .onRequest("logout", ({ params }) => {
      log("logout", params);
      authed = !script.requireAuth;
      return {};
    })
    .onRequest("session/new", ({ params, client }) => {
      log("session/new", params);
      requireAuth();
      const sessionId = `fake-session-${++sessions}`;
      declare(sessionId, params.mcpServers);
      announceCommands(client, sessionId);
      return { sessionId, configOptions };
    })
    .onRequest("session/load", async ({ params, client }) => {
      log("session/load", params);
      requireAuth();
      declare(params.sessionId, params.mcpServers);
      await send(client, params.sessionId, {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "replayed history" },
      });
      announceCommands(client, params.sessionId);
      return { configOptions };
    })
    .onRequest("session/resume", ({ params, client }) => {
      log("session/resume", params);
      requireAuth();
      declare(params.sessionId, params.mcpServers ?? []);
      announceCommands(client, params.sessionId);
      return { configOptions };
    })
    .onRequest("session/options", ({ params }) => {
      log("session/options", params);
      return { configOptions };
    })
    .onRequest("session/close", ({ params }) => {
      log("session/close", params);
      running?.cancel();
      return {};
    })
    .onRequest("session/delete", ({ params }) => {
      log("session/delete", params);
      return {};
    })
    .onRequest("session/set_config_option", ({ params }) => {
      log("session/set_config_option", params);
      if (!("type" in params))
        configOptions = configOptions.map((option) =>
          option.id === params.configId && option.type === "select"
            ? { ...option, currentValue: params.value }
            : option,
        );
      return { configOptions };
    })
    .onRequest("_session/steering", steerRequest, ({ params }) => {
      log("_session/steering", params);
      if (!running) return { outcome: "promptRequired", reason: "noRunningTurn" };
      record.steers.push(promptText(params.prompt));
      running.steer();
      return { outcome: "injected" };
    })
    .onRequest("session/prompt", async ({ params, client }) => {
      log("session/prompt", params);
      const text = promptText(params.prompt);
      const steps =
        text === "/compact" && script.commands?.includes("compact")
          ? [{ compaction: "in_progress" }, { compaction: "completed" }]
          : (script.turns?.[text] ?? script.defaultTurn ?? [{ text: "ok" }]);
      const cancelled = await run(client, params.sessionId, steps);
      return {
        stopReason: cancelled ? "cancelled" : (script.stopReason ?? "end_turn"),
        usage: script.promptUsage ?? null,
      };
    })
    .onNotification("session/cancel", ({ params }) => {
      log("session/cancel", params);
      running?.cancel();
    });
}

/**
 * Serves one connection. A script that speaks v2 goes behind the SDK's protocol router, which
 * selects v1 or v2 per initialize and answers -32022 when no version fits.
 */
interface FakeConnection {
  close(): void;
  closed: Promise<void>;
}

function connectFakeAgent(
  script: FakeAgentScript,
  record: FakeAgentRecord,
  exit: (code: number) => void,
  stream: Stream,
): FakeConnection {
  const supported = script.protocolVersions ?? [1];
  if (!supported.includes(2)) return fakeAgentApp(script, record, exit).connect(stream);
  const opened: { close(): void }[] = [];
  const tracked = (app: { connect(stream: Stream): { close(): void } }): AgentConnector => ({
    connect: (routed) => {
      const connection = app.connect(routed);
      opened.push(connection);
      return connection;
    },
  });
  const router = agentProtocolRouter().withV2(tracked(fakeAgentAppV2(script, record, exit)));
  if (supported.includes(1)) router.withV1(tracked(fakeAgentApp(script, record, exit)));
  const routed = router.connect(stream);
  return { close: () => opened.forEach((connection) => connection.close()), closed: routed.closed };
}

export interface FakeAgent extends AcpProcess {
  record: FakeAgentRecord;
}

/** Starts the fake agent in-process. Its shape matches a spawned agent process. */
export function startFakeAgent(script: FakeAgentScript): FakeAgent {
  const record = newRecord();
  const toAgent = new TransformStream<Uint8Array, Uint8Array>();
  const toClient = new TransformStream<Uint8Array, Uint8Array>();
  const exited = Promise.withResolvers<Error>();
  const end = (code: number) => {
    connection.close();
    exited.resolve(new Error(`fake agent exited with code ${code}`));
  };
  const connection = connectFakeAgent(
    script,
    record,
    end,
    ndJsonStream(toClient.writable, toAgent.readable),
  );
  return {
    record,
    transport: { output: toAgent.writable, input: toClient.readable },
    exited: exited.promise,
    stop: async () => end(0),
  };
}

// Stdio mode: the spawning test passes the script in the child's environment only.
if (process.env.FAKE_ACP_SCRIPT !== undefined) {
  const script: FakeAgentScript = JSON.parse(process.env.FAKE_ACP_SCRIPT);
  const record = newRecord();
  const connection = connectFakeAgent(
    script,
    record,
    (code) => process.exit(code),
    ndJsonStream(
      Writable.toWeb(process.stdout),
      // SAFETY: Node stdin emits Buffer (a Uint8Array); Node and DOM stream types differ only in ambient declarations here.
      Readable.toWeb(process.stdin) as ReadableStream<Uint8Array>,
    ),
  );
  void connection.closed.then(() => process.exit(0));
}
