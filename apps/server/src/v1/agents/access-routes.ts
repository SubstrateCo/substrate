import { agentAccessChange, agentAccessScope } from "@startup-os/contracts/agents";

import { respond, validationHook } from "../../shared/http";
import { changeAgentAccess, listAgentAccess } from "./access-service";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

export const agentAccessRoutes = new Hono()
  .get("/", zValidator("query", agentAccessScope, validationHook), async (c) =>
    respond(c, await listAgentAccess(c.req.raw.headers, c.req.valid("query"))),
  )
  .post("/", zValidator("json", agentAccessChange, validationHook), async (c) =>
    respond(c, await changeAgentAccess(c.req.raw.headers, c.req.valid("json"))),
  );
