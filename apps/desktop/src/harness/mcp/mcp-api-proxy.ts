import {
  workspaceApiResult,
  workspaceApiRequest,
  type WorkspaceApiProxy,
} from "@startup-os/contracts/harness/mcp";

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
    const organizationId = await scope();
    const payload = { ...request.input, organizationId };
    const url = new URL(request.path, options.backend);
    if (request.method === "GET") {
      for (const [key, value] of Object.entries(payload)) {
        url.searchParams.set(
          key,
          String(z.union([z.string(), z.number(), z.boolean()]).parse(value)),
        );
      }
    }
    const init: RequestInit = {
      method: request.method,
      redirect: "error",
    };
    if (request.method !== "GET") {
      init.headers = { "content-type": "application/json" };
      init.body = JSON.stringify(payload);
    }
    const response = await options.fetchAPI(url.href, init);
    const result = workspaceApiResult.parse(await response.json());
    // Never replay a mutation in a different workspace or expose a stale result.
    if ((await scope()) !== organizationId)
      throw new Error("Workspace changed. Run the tool again in the current workspace.");
    return result;
  };
}
