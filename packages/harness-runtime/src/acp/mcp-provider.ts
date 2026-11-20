/**
 * Serves a lease's Substrate tools over MCP-over-ACP (RFD mcp-over-acp, Draft): the agent sends
 * inner MCP requests to the client as `mcp/message`, so no loopback port or bearer token is
 * needed. Tool set, routing, offload and turn binding come from the lease's McpToolEndpoint,
 * the same object the loopback HTTP server serves (mcp.ts).
 *
 * The binding is stateless and supports only MCP 2026-07-28
 * (@agentclientprotocol/sdk dist/mcp/core.d.ts MCP_PROTOCOL_VERSION). fromMcpServer runs each
 * request through @modelcontextprotocol/server 2.x, which implements that revision; the 1.x
 * SDK in mcp.ts does not, so this file builds its server with 2.x.
 */
import type { McpInput, McpToolName } from "@substrate/contracts/harness/tools";

import { mcpInstructions, mcpServerInfo, mcpToolConfig, type McpToolEndpoint } from "../mcp.ts";
import type { AcpMcpHandler } from "./driver.ts";
import { fromMcpServer } from "@agentclientprotocol/sdk/experimental/mcp-server";
import { McpServer } from "@modelcontextprotocol/server";

/** The server name in the ACP declaration; the HTTP lease uses the same name. */
export const substrateMcpName = "substrate";

export interface AcpToolServer {
  handler: AcpMcpHandler;
  close(): Promise<void>;
}

/** One MCP-over-ACP server for one native session's lease. */
export function acpToolServer(endpoint: McpToolEndpoint): AcpToolServer {
  const adapted = fromMcpServer(() => {
    const server = new McpServer(mcpServerInfo, { instructions: mcpInstructions });
    for (const name of endpoint.tools)
      server.registerTool(name, mcpToolConfig(name), (input: McpInput<McpToolName>) =>
        endpoint.call(name, input),
      );
    return server;
  });
  return {
    handler: async (request) => {
      // A revoked or expired lease fails the binding (-33002), as HTTP answers 401.
      if (!endpoint.touch()) throw new Error("Credential revoked or expired");
      return adapted.handler(request);
    },
    close: () => adapted.close(),
  };
}
