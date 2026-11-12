import {
  agentCallerInput,
  listCallersInput,
  saveCallerPolicyInput,
} from "@substrate/contracts/agents";

import { respond, v } from "../../shared/http";
import type { ScopeEnv, Scopes } from "../../shared/scope";
import type { CallerService } from "./callers-service";
import { Hono } from "hono";

/** Caller settings act in one workspace, because the allowlist and the audit log are per workspace. */
export function createCallerRoutes(service: CallerService, scopes: Scopes) {
  return new Hono<ScopeEnv>()
    .post(
      "/actors/callers/policy",
      v("json", saveCallerPolicyInput),
      scopes.workspace("json"),
      async (c) => respond(c, await service.savePolicy(c.var.scope, c.req.valid("json"))),
    )
    .post(
      "/actors/callers/list",
      v("json", listCallersInput),
      scopes.workspace("json"),
      async (c) => respond(c, await service.listCallers(c.var.scope, c.req.valid("json"))),
    )
    .post(
      "/actors/callers/allow",
      v("json", agentCallerInput),
      scopes.workspace("json"),
      async (c) => respond(c, await service.allowCaller(c.var.scope, c.req.valid("json"))),
    )
    .post(
      "/actors/callers/remove",
      v("json", agentCallerInput),
      scopes.workspace("json"),
      async (c) => respond(c, await service.removeCaller(c.var.scope, c.req.valid("json"))),
    );
}
