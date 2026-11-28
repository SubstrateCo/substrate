import {
  mcpOutputOffloadBytes,
  type JsonObject,
  type OffloadedOutput,
  type ToolCallResult,
  type ToolDescriptor,
  type ToolProvider,
  type ToolServerIdentity,
} from "@substrate/contracts/harness-runtime";

import { saveDownload, type SavedDownload } from "./files.ts";
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
  sessionId: string;
  tools: readonly string[];
  folder: string;
}

/** A tools/call result. Both MCP SDK generations accept this shape. */
export type McpToolResult = {
  isError?: boolean;
  content: [{ type: "text"; text: string }, ...{ type: "image"; data: string; mimeType: string }[]];
  structuredContent?: JsonObject | OffloadedOutput | SavedDownload;
};

interface LeaseTurn<Binding> {
  turnId: string;
  binding: Binding;
}

export interface McpToolEndpoint {
  readonly server: ToolServerIdentity;
  readonly tools: readonly string[];
  config(name: string): ReturnType<typeof mcpToolConfig>;
  /** False once the lease is revoked or expired. A use renews an unexpired lease. */
  touch(): boolean;
  /** Input must already match the tool's input schema; both MCP servers validate it first. */
  call(name: string, input: JsonObject): Promise<McpToolResult>;
}

/**
 * A stable MCP endpoint for one native session. Calls succeed only while a turn is bound: the
 * host binds the turn at each turn and unbinds it when the turn ends.
 */
export interface McpLease<Binding = unknown> {
  server: string;
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
  bind(turn: LeaseTurn<Binding>): void;
  unbind(): void;
  revoke(): void;
}

function mcpToolConfig(tool: ToolDescriptor) {
  return {
    title: tool.title,
    description: tool.description,
    inputSchema: tool.input,
    annotations: {
      title: tool.title,
      readOnlyHint: tool.readOnly,
      destructiveHint: tool.destructive,
      idempotentHint: tool.idempotent,
      openWorldHint: false,
    },
  };
}

const leaseIdleTtlMs = 24 * 60 * 60 * 1000;

interface LeaseState<Binding> {
  options: McpLeaseOptions;
  expires: number;
  context?: LeaseTurn<Binding>;
  outputs: Map<string, number>;
  endpoint: McpToolEndpoint;
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

function jsonResult(structured: NonNullable<McpToolResult["structuredContent"]>): McpToolResult {
  return {
    structuredContent: structured,
    content: [{ type: "text", text: JSON.stringify(structured) }],
  };
}

async function fileResult(
  result: Extract<ToolCallResult, { success: true }>,
  folder: string,
  turnId: string,
): Promise<McpToolResult | undefined> {
  if (result.download)
    return jsonResult(await saveDownload(folder, turnId, result.download, result.data));
  if (!result.image) return undefined;
  const { data, mimeType } = result.image;
  return {
    structuredContent: result.data,
    content: [
      { type: "text", text: JSON.stringify(result.data) },
      { type: "image", data, mimeType },
    ],
  };
}

async function callTool<Binding>(
  lease: LeaseState<Binding>,
  provider: ToolProvider<Binding>,
  live: () => boolean,
  name: string,
  input: JsonObject,
): Promise<McpToolResult> {
  try {
    if (!live()) throw new Error("Credential revoked or expired");
    if (!lease.options.tools.includes(name)) throw new Error("Tool not offered on this lease");
    const turn = lease.context;
    const { organizationId, agentId, sessionId, folder } = lease.options;
    if (!turn)
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({
              code: "NO_TURN",
              message: "No turn is running for this session.",
              hint: provider.errorHint("NO_TURN"),
            }),
          },
        ],
      };
    const result = await provider.call({
      tool: name,
      input,
      organizationId,
      agentId,
      sessionId,
      binding: turn.binding,
    });
    if (!live()) throw new Error("Credential revoked or expired");
    if (!result.success)
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({ ...result.error, hint: provider.errorHint(result.error.code) }),
          },
        ],
      };
    const file = await fileResult(result, folder, turn.turnId);
    if (file) return file;
    const { data } = result;
    const policy = provider.outputPolicy(name);
    if (
      policy === "turn-only" &&
      (lease.context !== turn || Buffer.byteLength(JSON.stringify(data)) > mcpOutputOffloadBytes)
    )
      return unavailable;
    const sequence = (lease.outputs.get(name) ?? 0) + 1;
    const offloaded =
      policy === "offload"
        ? await offloadOutput(folder, turn.turnId, name, sequence, data, provider.pagingFields)
        : undefined;
    if (offloaded) lease.outputs.set(name, sequence);
    return jsonResult(offloaded ?? data);
  } catch {
    return unavailable;
  }
}

export async function createStartupMcp<Binding>(
  provider: ToolProvider<Binding>,
  options: { leaseTtlMs?: number } = {},
) {
  const ttl = options.leaseTtlMs ?? leaseIdleTtlMs;
  const leases = new Map<string, LeaseState<Binding>>();
  const valid = (lease: LeaseState<Binding>) =>
    lease.context !== undefined || lease.expires > Date.now();
  const active = new Set<McpServer>();
  let authority = "";
  const server = createServer(async (request, response) => {
    const addressedToThisServer = request.headers.host === authority;
    const sentByBrowser = request.headers.origin !== undefined;
    if (!addressedToThisServer || sentByBrowser) {
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
    const { endpoint } = lease;
    const { name, version, instructions } = endpoint.server;
    const mcp = new McpServer({ name, version }, { instructions });
    for (const tool of endpoint.tools)
      mcp.registerTool(tool, endpoint.config(tool), (input: JsonObject) =>
        endpoint.call(tool, input),
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
    issue(options: McpLeaseOptions): McpLease<Binding> {
      const token = randomBytes(32).toString("hex");
      const tools = options.tools.filter((name) => provider.describe(name) !== undefined);
      const live = () => leases.get(token) === state && valid(state);
      const state: LeaseState<Binding> = {
        options: { ...options, tools },
        expires: Date.now() + ttl,
        outputs: new Map<string, number>(),
        endpoint: {
          server: provider.server,
          tools,
          config(name) {
            const tool = provider.describe(name);
            if (!tool) throw new Error("Unknown tool");
            return mcpToolConfig(tool);
          },
          touch() {
            if (!live()) return false;
            state.expires = Date.now() + ttl;
            return true;
          },
          call: (name, input) => callTool(state, provider, live, name, input),
        },
      };
      leases.set(token, state);
      return {
        server: provider.server.name,
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
