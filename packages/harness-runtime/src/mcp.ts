import {
  mcpOutputOffloadBytes,
  type LocalToolProxy,
  type OffloadedOutput,
  type TurnContext,
  type WorkspaceApiProxy,
  type WorkspaceApiResult,
} from "@substrate/contracts/harness/mcp";
import {
  mcpTools,
  type LocalToolName,
  type McpInput,
  type McpOutput,
  type McpToolName,
  type ToolDefinition,
} from "@substrate/contracts/harness/tools";

import { forget, MemoryError, remember } from "./memory.ts";
import { offloadOutput } from "./offload.ts";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { z } from "zod";

const tcpAddress = z.object({ port: z.number() });

export interface McpLeaseOptions {
  organizationId: string;
  agentId: string;
  /** The local agent-work session that owns this endpoint. */
  sessionId: string;
  /** Tools offered on this endpoint; see leaseTools. */
  tools: McpToolName[];
  /** The session's working folder. Large outputs are written below it. */
  folder: string;
  /** The main agent folder. Memory files live here, also for helper sessions. */
  agentFolder: string;
}

/** A tools/call result. Both MCP SDK generations accept this shape. */
export type McpToolResult = {
  isError?: boolean;
  content: { type: "text"; text: string }[];
  structuredContent?: McpOutput<McpToolName> | OffloadedOutput;
};

/**
 * The transport-agnostic side of one lease: its tool set, routing, output offload and turn
 * binding. The loopback HTTP server and the MCP-over-ACP provider (acp/mcp-provider.ts) both
 * serve this, so a session sees the same tools and the same NO_TURN rule on either transport.
 */
export interface McpToolEndpoint {
  readonly tools: readonly McpToolName[];
  /** False once the lease is revoked or expired. A use renews an unexpired lease. */
  touch(): boolean;
  /** Input must already match the tool's input schema; both MCP servers validate it first. */
  call(name: McpToolName, input: McpInput<McpToolName>): Promise<McpToolResult>;
}

/**
 * A stable MCP endpoint for one native session. Calls succeed only while a turn is bound: the
 * host binds the turn context at each turn and unbinds it when the turn ends.
 */
export interface McpLease {
  url: string;
  token: string;
  organizationId: string;
  agentId: string;
  sessionId: string;
  /**
   * The lease's tools for in-process transports. Set on every lease from createStartupMcp;
   * absent on test doubles, which then reach agents only over HTTP.
   */
  endpoint?: McpToolEndpoint;
  bind(context: TurnContext): void;
  unbind(): void;
  revoke(): void;
}

export const mcpServerInfo = { name: "substrate", version: "1.0.0" };

export const mcpInstructions =
  "Substrate connects workspace search, messages, and enabled workspace apps. Tasks, CRM and Inbox are optional. " +
  "Use your harness's tool discovery to discover relevant operations when their schemas are not loaded; " +
  "do not assume a capability is unavailable just because its tool is not listed in context. " +
  "Load the relevant domain skills for workflow guidance. Only tools offered to this session are available; " +
  "discovery does not grant record access or permission to write.";

/** registerTool config for both MCP SDK generations. */
export function mcpToolConfig(name: McpToolName) {
  const tool = mcpTools[name];
  const hints: ToolDefinition = tool;
  // No outputSchema: a large result is replaced by an offload reference of another shape.
  return {
    title: tool.title,
    description: tool.description,
    inputSchema: tool.input,
    annotations: {
      title: tool.title,
      readOnlyHint: hints.readOnly,
      destructiveHint: hints.destructive ?? false,
      idempotentHint: hints.readOnly || (hints.idempotent ?? false),
      openWorldHint: false,
    },
  };
}

export interface StartupMcpHandlers {
  workspace?: WorkspaceApiProxy;
  local?: LocalToolProxy;
}

/** An open session's lease expires only after it stays unused and unbound this long. */
const leaseIdleTtlMs = 24 * 60 * 60 * 1000;

interface LeaseState {
  options: McpLeaseOptions;
  /** Ignored while a turn is bound: a lease never expires under a live turn. */
  expires: number;
  context?: TurnContext;
  /** Output files per tool in the bound turn. */
  outputs: Map<string, number>;
  endpoint: McpToolEndpoint;
}

/** What an agent should do next for each workspace API error code. */
// oxlint-disable-next-line deslop/prefer-literal-union -- Workspace errors use an open string code; unknown codes need the default hint.
function errorHint(code: string) {
  switch (code) {
    case "NOT_FOUND":
      return "The record does not exist or you cannot access it. Find IDs with search or a list tool; do not guess IDs.";
    case "INVALID_INPUT":
      return "Correct the input as the message says, then retry.";
    case "CONFLICT":
      return "This requestId was already used with different input. Use a new requestId for a new action.";
    case "UNAUTHENTICATED":
    case "FORBIDDEN":
      return "Stop. Tell your owner to sign in to Substrate in this workspace and start a new run.";
    case "NO_TURN":
      return "Do not retry. Substrate tools work only while a turn is running.";
    case "APP_DISABLED":
      return "Stop this workflow. Do not retry or use another tool to bypass the disabled app. Tell your owner the app must be enabled first.";
    default:
      return "Retry once. If it fails again, stop and report the error to your owner.";
  }
}

const memoryTools: ReadonlySet<string> = new Set(["remember", "forget"]);

function isLocalTool(name: McpToolName): name is LocalToolName {
  return mcpTools[name].scope === "local";
}

async function runMemoryTool(
  name: McpToolName,
  folder: string,
  input: McpInput<McpToolName>,
): Promise<WorkspaceApiResult> {
  try {
    const data =
      name === "remember"
        ? await remember(folder, mcpTools.remember.input.parse(input))
        : await forget(folder, mcpTools.forget.input.parse(input));
    return { success: true, data };
  } catch (error) {
    if (error instanceof MemoryError)
      return { success: false, error: { code: error.code, message: error.message } };
    throw error;
  }
}

const unavailable: McpToolResult = {
  isError: true,
  content: [
    {
      type: "text",
      text: "Workspace operation unavailable. Check the session, workspace and agent access before retrying.",
    },
  ],
};

/** Runs one tool call for a lease. live: the lease is still issued and unexpired. */
async function callTool(
  lease: LeaseState,
  handlers: StartupMcpHandlers,
  live: () => boolean,
  name: McpToolName,
  input: McpInput<McpToolName>,
): Promise<McpToolResult> {
  try {
    if (!live()) throw new Error("Credential revoked or expired");
    if (!lease.options.tools.includes(name)) throw new Error("Tool not offered on this lease");
    // The turn is captured when the call starts; a call in flight at turn end completes.
    const turn = lease.context;
    const { organizationId, agentId, sessionId } = lease.options;
    if (!turn)
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({
              code: "NO_TURN",
              message: "No turn is running for this session.",
              hint: errorHint("NO_TURN"),
            }),
          },
        ],
      };
    let result: WorkspaceApiResult;
    if (memoryTools.has(name)) result = await runMemoryTool(name, lease.options.agentFolder, input);
    else if (isLocalTool(name)) {
      if (!handlers.local) throw new Error("Local tools unavailable");
      result = await handlers.local({
        tool: name,
        sessionId,
        organizationId,
        agentId,
        turn,
        input,
      });
    } else {
      if (!handlers.workspace) throw new Error("Workspace API unavailable");
      result = await handlers.workspace({ tool: name, organizationId, agentId, turn, input });
    }
    if (!live()) throw new Error("Credential revoked or expired");
    if (!result.success)
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({ ...result.error, hint: errorHint(result.error.code) }),
          },
        ],
      };
    const data = mcpTools[name].output.parse(result.data);
    const sequence = (lease.outputs.get(name) ?? 0) + 1;
    // Inbox excerpts are private to the bound owner turn; never persist them to the agent folder.
    const inbox = name === "search_inbox" || name === "read_inbox_message";
    if (
      inbox &&
      (lease.context !== turn || Buffer.byteLength(JSON.stringify(data)) > mcpOutputOffloadBytes)
    )
      return unavailable;
    const offloaded = inbox
      ? undefined
      : await offloadOutput(lease.options.folder, turn.turnId, name, sequence, data);
    if (offloaded) lease.outputs.set(name, sequence);
    const structured = offloaded ?? data;
    return {
      structuredContent: structured,
      content: [{ type: "text", text: JSON.stringify(structured) }],
    };
  } catch {
    return unavailable;
  }
}

export async function createStartupMcp(
  handlers: StartupMcpHandlers = {},
  options: { leaseTtlMs?: number } = {},
) {
  const ttl = options.leaseTtlMs ?? leaseIdleTtlMs;
  const leases = new Map<string, LeaseState>();
  const valid = (lease: LeaseState) => lease.context !== undefined || lease.expires > Date.now();
  const active = new Set<McpServer>();
  let authority = "";
  const server = createServer(async (request, response) => {
    // Native clients have no Origin. Reject all browser-origin requests and DNS rebinding.
    if (request.headers.host !== authority || request.headers.origin !== undefined) {
      response.writeHead(403).end();
      return;
    }
    if (request.url !== "/mcp") {
      response.writeHead(404).end();
      return;
    }
    const candidate = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.authorization ?? "")?.[1];
    if (!candidate) {
      response.writeHead(401).end();
      return;
    }
    const token = [...leases.keys()].find(
      (key) =>
        key.length === candidate.length &&
        timingSafeEqual(Buffer.from(key), Buffer.from(candidate)),
    );
    const lease = token ? leases.get(token) : undefined;
    // Use renews the lease while its session stays open.
    if (!token || !lease || !lease.endpoint.touch()) {
      response.writeHead(401).end();
      return;
    }
    if (request.method !== "POST") {
      response.writeHead(405, { Allow: "POST" }).end();
      return;
    }
    let bytes = 0;
    const chunks: Buffer[] = [];
    let body: unknown;
    try {
      // Consume once before handing the parsed body to the SDK. A data listener
      // here would drain Node's stream while mcp.connect() is awaited.
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > 1024 * 1024) {
          response.writeHead(413).end();
          return;
        }
        chunks.push(chunk);
      }
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      response.writeHead(400).end();
      return;
    }
    const mcp = new McpServer(mcpServerInfo, { instructions: mcpInstructions });
    const { endpoint } = lease;
    for (const name of endpoint.tools)
      mcp.registerTool(name, mcpToolConfig(name), (input: McpInput<McpToolName>) =>
        endpoint.call(name, input),
      );
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    active.add(mcp);
    response.on("close", () => {
      active.delete(mcp);
      void mcp.close();
    });
    try {
      await mcp.connect(transport);
      await transport.handleRequest(request, response, body);
    } catch {
      if (!response.headersSent) response.writeHead(500).end();
      else response.end();
      active.delete(mcp);
      await mcp.close();
    }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  // A TCP listener reports an AddressInfo; a pipe path or a closed server does not.
  const address = tcpAddress.safeParse(server.address());
  if (!address.success) throw new Error("MCP loopback listener failed");
  authority = `127.0.0.1:${address.data.port}`;
  return {
    issue(options: McpLeaseOptions): McpLease {
      const token = randomBytes(32).toString("hex");
      const tools = [...options.tools];
      const live = () => leases.get(token) === state && valid(state);
      const state: LeaseState = {
        options: { ...options, tools },
        expires: Date.now() + ttl,
        outputs: new Map<string, number>(),
        endpoint: {
          tools,
          touch() {
            if (!live()) return false;
            state.expires = Date.now() + ttl;
            return true;
          },
          call: (name, input) => callTool(state, handlers, live, name, input),
        },
      };
      leases.set(token, state);
      return {
        url: `http://${authority}/mcp`,
        token,
        organizationId: options.organizationId,
        agentId: options.agentId,
        sessionId: options.sessionId,
        endpoint: state.endpoint,
        bind(context) {
          state.context = context;
          state.outputs.clear();
        },
        unbind() {
          state.context = undefined;
          state.expires = Date.now() + ttl;
        },
        revoke: () => {
          state.context = undefined;
          leases.delete(token);
        },
      };
    },
    async close(): Promise<void> {
      leases.clear();
      await Promise.all([...active].map((entry) => entry.close()));
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
