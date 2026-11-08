import {
  workspaceApiResult,
  workspaceApiRequest,
  type WorkspaceApiProxy,
} from "@startup-os/contracts/harness/mcp";
import { mcpTools } from "@startup-os/contracts/harness/tools";

import { readVerifiedSession } from "../controller/harness-authority.ts";

export function createMcpApiProxy(options: {
  backend: string;
  userId: string;
  isActive: () => boolean;
  fetchAPI: (url: string, init: RequestInit) => Promise<Response>;
}): WorkspaceApiProxy {
  async function scope() {
    if (!options.isActive()) throw new Error("MCP connection closed.");
    const data = await readVerifiedSession(options.fetchAPI, options.backend);
    if (!options.isActive() || data.user.id !== options.userId) throw new Error("Session changed.");
    return data.session.activeOrganizationId;
  }

  return async (raw) => {
    const request = workspaceApiRequest.parse(raw);
    mcpTools[request.tool].input.parse(request.input);
    const organizationId = await scope();
    // Returned, not thrown, so the agent receives this message instead of a generic failure.
    if (organizationId !== request.organizationId)
      return {
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "Workspace changed. Start a new agent run in this workspace.",
        },
      };
    const url = new URL("/api/v1/mcp/call", options.backend);
    const init: RequestInit = {
      method: "POST",
      redirect: "error",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    };
    // The server validates the session and workspace scope in this request.
    const response = await options.fetchAPI(url.href, init);
    return workspaceApiResult.parse(await response.json());
  };
}
