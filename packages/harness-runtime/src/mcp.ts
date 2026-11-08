import type { WorkspaceApiRequest, WorkspaceApiProxy } from "@startup-os/contracts/harness/mcp";
import {
  mcpTools,
  type McpToolName,
  type ToolDefinition,
} from "@startup-os/contracts/harness/tools";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

/* oxlint-disable deslop/no-runtime-typeof -- The server.address() platform union is checked before constructing a loopback URL. */

export interface McpLease {
  url: string;
  token: string;
  /** Both workspace and agent identity are bound to this launch. */
  organizationId: string;
  agentId: string;
  revoke(): void;
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
    default:
      return "Retry once. If it fails again, stop and report the error to your owner.";
  }
}

export async function createStartupMcp(proxy?: WorkspaceApiProxy) {
  const leases = new Map<string, { organizationId: string; agentId: string; expires: number }>();
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
    if (!lease || lease.expires <= Date.now()) {
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
    const mcp = new McpServer({ name: "startup-os", version: "1.0.0" });
    // SAFETY: Object.keys reads the statically defined tool registry, not external input.
    for (const name of Object.keys(mcpTools) as McpToolName[]) {
      const tool = mcpTools[name];
      const hints: ToolDefinition = tool;
      mcp.registerTool(
        name,
        {
          title: tool.title,
          description: tool.description,
          inputSchema: tool.input,
          outputSchema: tool.output,
          annotations: {
            title: tool.title,
            readOnlyHint: hints.readOnly,
            destructiveHint: hints.destructive ?? false,
            idempotentHint: hints.readOnly || (hints.idempotent ?? false),
            openWorldHint: false,
          },
        },
        async (input: WorkspaceApiRequest["input"]) => {
          try {
            if (!token || !leases.has(token) || lease.expires <= Date.now())
              throw new Error("Credential revoked or expired");
            if (!proxy) throw new Error("Workspace API unavailable");
            const result = await proxy({
              organizationId: lease.organizationId,
              agentId: lease.agentId,
              tool: name,
              input: JSON.parse(JSON.stringify(input)),
            });
            if (!leases.has(token) || lease.expires <= Date.now())
              throw new Error("Credential revoked or expired");
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
            return {
              structuredContent: data,
              content: [{ type: "text" as const, text: JSON.stringify(data) }],
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
    issue(organizationId: string, agentId: string): McpLease {
      const token = randomBytes(32).toString("hex");
      leases.set(token, { organizationId, agentId, expires: Date.now() + 24 * 60 * 60 * 1000 });
      return {
        url: `http://${authority}/mcp`,
        token,
        organizationId,
        agentId,
        revoke: () => {
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
