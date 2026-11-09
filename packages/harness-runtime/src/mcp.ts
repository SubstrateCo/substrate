import type {
  LocalToolProxy,
  TurnContext,
  WorkspaceApiProxy,
  WorkspaceApiResult,
} from "@startup-os/contracts/harness/mcp";
import {
  mcpTools,
  type LocalToolName,
  type McpInput,
  type McpToolName,
  type ToolDefinition,
} from "@startup-os/contracts/harness/tools";

import { forget, MemoryError, remember } from "./memory.ts";
import { offloadOutput } from "./offload.ts";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

/* oxlint-disable deslop/no-runtime-typeof -- The server.address() platform union is checked before constructing a loopback URL. */

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
  bind(context: TurnContext): void;
  unbind(): void;
  revoke(): void;
}

export interface StartupMcpHandlers {
  workspace?: WorkspaceApiProxy;
  local?: LocalToolProxy;
}

/** An open session's lease expires only after it stays unused and unbound this long. */
export const leaseIdleTtlMs = 24 * 60 * 60 * 1000;

interface LeaseState {
  options: McpLeaseOptions;
  /** Ignored while a turn is bound: a lease never expires under a live turn. */
  expires: number;
  context?: TurnContext;
  /** Output files per tool in the bound turn. */
  outputs: Map<string, number>;
}

/** What an agent should do next for each workspace API error code. */
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
      return "Stop. Tell your owner to sign in to Startup OS in this workspace and start a new run.";
    case "NO_TURN":
      return "Do not retry. Startup OS tools work only while a turn is running.";
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
    if (!token || !lease || !valid(lease)) {
      response.writeHead(401).end();
      return;
    }
    // Use renews the lease while its session stays open.
    lease.expires = Date.now() + ttl;
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
    const live = () => leases.get(token) === lease && valid(lease);
    const mcp = new McpServer({ name: "startup-os", version: "1.0.0" });
    for (const name of lease.options.tools) {
      const tool = mcpTools[name];
      const hints: ToolDefinition = tool;
      // No outputSchema: a large result is replaced by an offload reference of another shape.
      mcp.registerTool(
        name,
        {
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
        },
        async (input: McpInput<McpToolName>) => {
          try {
            if (!live()) throw new Error("Credential revoked or expired");
            // The turn is captured when the call starts; a call in flight at turn end completes.
            const turn = lease.context;
            const { organizationId, agentId, sessionId } = lease.options;
            const json = JSON.parse(JSON.stringify(input));
            if (!turn)
              return {
                isError: true,
                content: [
                  {
                    type: "text" as const,
                    text: JSON.stringify({
                      code: "NO_TURN",
                      message: "No turn is running for this session.",
                      hint: errorHint("NO_TURN"),
                    }),
                  },
                ],
              };
            let result: WorkspaceApiResult;
            if (memoryTools.has(name))
              result = await runMemoryTool(name, lease.options.agentFolder, json);
            else if (isLocalTool(name)) {
              if (!handlers.local) throw new Error("Local tools unavailable");
              result = await handlers.local({
                tool: name,
                sessionId,
                organizationId,
                agentId,
                turn,
                input: json,
              });
            } else {
              if (!handlers.workspace) throw new Error("Workspace API unavailable");
              result = await handlers.workspace({
                tool: name,
                organizationId,
                agentId,
                turn,
                input: json,
              });
            }
            if (!live()) throw new Error("Credential revoked or expired");
            if (!result.success)
              return {
                isError: true,
                content: [
                  {
                    type: "text" as const,
                    text: JSON.stringify({ ...result.error, hint: errorHint(result.error.code) }),
                  },
                ],
              };
            const data = tool.output.parse(result.data);
            const sequence = (lease.outputs.get(name) ?? 0) + 1;
            const offloaded = await offloadOutput(
              lease.options.folder,
              turn.turnId,
              name,
              sequence,
              data,
            );
            if (offloaded) lease.outputs.set(name, sequence);
            const structured = offloaded ?? data;
            return {
              structuredContent: structured,
              content: [{ type: "text" as const, text: JSON.stringify(structured) }],
            };
          } catch {
            return {
              isError: true,
              content: [
                {
                  type: "text" as const,
                  text: "Workspace operation unavailable. Check the session, workspace and agent access before retrying.",
                },
              ],
            };
          }
        },
      );
    }
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
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("MCP loopback listener failed");
  authority = `127.0.0.1:${address.port}`;
  return {
    issue(options: McpLeaseOptions): McpLease {
      const token = randomBytes(32).toString("hex");
      const state: LeaseState = {
        options: { ...options, tools: [...options.tools] },
        expires: Date.now() + ttl,
        outputs: new Map<string, number>(),
      };
      leases.set(token, state);
      return {
        url: `http://${authority}/mcp`,
        token,
        organizationId: options.organizationId,
        agentId: options.agentId,
        sessionId: options.sessionId,
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
