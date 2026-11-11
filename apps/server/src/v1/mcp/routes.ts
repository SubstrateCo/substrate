import { mcpCall } from "@substrate/contracts/harness/tools";

import { respond, validationHook } from "../../shared/http";
import { callAgentTool } from "./service";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

export function createMcpRoutes() {
  return new Hono().post("/call", zValidator("json", mcpCall, validationHook), async (c) =>
    respond(c, await callAgentTool(c.req.raw.headers, c.req.valid("json"))),
  );
}
