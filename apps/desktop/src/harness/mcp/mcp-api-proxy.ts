import {
  workspaceApiResult,
  workspaceApiRequest,
  type WorkspaceApiProxy,
} from "@startup-os/contracts/harness/mcp";
import { mcpTools } from "@startup-os/contracts/harness/tools";

import { z } from "zod";

const sessionResult = z.object({
  success: z.literal(true),
  data: z.object({
    user: z.object({ id: z.string().min(1), emailVerified: z.literal(true) }),
    session: z.object({ activeOrganizationId: z.string().min(1) }),
  }),
});

export function createMcpApiProxy(options: {
  backend: string;
  userId: string;
  isActive: () => boolean;
  fetchAPI: (url: string, init: RequestInit) => Promise<Response>;
}): WorkspaceApiProxy {
  async function scope() {
    if (!options.isActive()) throw new Error("MCP connection closed.");
    const response = await options.fetchAPI(new URL("/api/v1/session", options.backend).href, {
      method: "GET",
      redirect: "error",
    });
    if (!response.ok) throw new Error("Session unavailable.");
    const { data } = sessionResult.parse(await response.json());
    if (!options.isActive() || data.user.id !== options.userId) throw new Error("Session changed.");
    return data.session.activeOrganizationId;
  }

  return async (raw) => {
    const request = workspaceApiRequest.parse(raw);
    mcpTools[request.tool].input.parse(request.input);
    const organizationId = await scope();
    if (organizationId !== request.organizationId)
      throw new Error("Workspace changed. Start a new agent run in this workspace.");
    const url = new URL("/api/v1/mcp/call", options.backend);
    const init: RequestInit = {
      method: "POST",
      redirect: "error",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    };
    const response = await options.fetchAPI(url.href, init);
    const result = workspaceApiResult.parse(await response.json());
    // Never replay a mutation in a different workspace or expose a stale result.
    if ((await scope()) !== organizationId)
      throw new Error("Workspace changed. Run the tool again in the current workspace.");
    return result;
  };
}
