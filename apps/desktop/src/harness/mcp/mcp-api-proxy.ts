import {
  workspaceApiResult,
  workspaceApiRequest,
  type WorkspaceApiProxy,
} from "@startup-os/contracts/harness/mcp";
import { mcpTools } from "@startup-os/contracts/harness/tools";

/** The server's FORBIDDEN message when the call's organization is no longer the active one. */
const workspaceChanged = "Your active workspace changed.";

export function createMcpApiProxy(options: {
  backend: string;
  /** False once main disconnects this worker generation, such as on sign-out or session change. */
  isActive: () => boolean;
  fetchAPI: (url: string, init: RequestInit) => Promise<Response>;
}): WorkspaceApiProxy {
  return async (raw) => {
    const request = workspaceApiRequest.parse(raw);
    mcpTools[request.tool].input.parse(request.input);
    if (!options.isActive()) throw new Error("MCP connection closed.");
    const url = new URL("/api/v1/mcp/call", options.backend);
    const init: RequestInit = {
      method: "POST",
      redirect: "error",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    };
    // The server validates the session, the membership and the active workspace in this request.
    const response = await options.fetchAPI(url.href, init);
    const result = workspaceApiResult.parse(await response.json());
    // The server's wording asks a person to reload; the agent gets a message it can act on.
    if (!result.success && result.error.message.startsWith(workspaceChanged))
      return {
        success: false,
        error: {
          code: result.error.code,
          message: "Workspace changed. Start a new agent run in this workspace.",
        },
      };
    return result;
  };
}
