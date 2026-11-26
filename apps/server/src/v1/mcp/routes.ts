import { mcpCall } from "@substrate/contracts/harness/tools";

import { respond, respondAccepted, v } from "../../shared/http";
import type { ScopeEnv, Scopes } from "../../shared/scope";
import type { McpService } from "./service";
import { Hono } from "hono";

export function createMcpRoutes(service: McpService, scopes: Scopes) {
  return new Hono<ScopeEnv>().post(
    "/call",
    v("json", mcpCall),
    scopes.workspace("json"),
    async (c) => {
      const result = await service.callAgentTool(c.var.scope, c.req.valid("json"));
      // The call was stored for the owner's approval: accepted, not failed.
      if ("pending" in result) return respondAccepted(c, result.pending);
      return respond(c, result);
    },
  );
}
