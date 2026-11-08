import { mcpCall } from "@startup-os/contracts/harness/tools";

import { respond, validationHook } from "../../shared/http";
import * as defaultServices from "./service";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

export function createMcpRoutes(services = defaultServices) {
  return new Hono().post("/call", zValidator("json", mcpCall, validationHook), async (c) =>
    respond(c, await services.callAgentTool(c.req.raw.headers, c.req.valid("json"))),
  );
}
