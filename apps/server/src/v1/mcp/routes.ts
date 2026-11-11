import { mcpCall } from "@substrate/contracts/harness/tools";

import { respond, v } from "../../shared/http";
import type { ScopeEnv, Scopes } from "../../shared/scope";
import type { McpService } from "./service";
import { Hono } from "hono";

export function createMcpRoutes(service: McpService, scopes: Scopes) {
  return new Hono<ScopeEnv>().post(
    "/call",
    v("json", mcpCall),
    scopes.workspace("json"),
    async (c) => respond(c, await service.callAgentTool(c.var.scope, c.req.valid("json"))),
  );
}
