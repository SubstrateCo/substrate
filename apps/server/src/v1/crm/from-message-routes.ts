import { crmFromMessage } from "@substrate/contracts/crm/from-message";

import { respond, v } from "../../shared/http";
import type { ScopeEnv, Scopes } from "../../shared/scope";
import type { CrmFromMessageService } from "./from-message-service";
import { Hono } from "hono";

export function createCrmFromMessageRoutes(service: CrmFromMessageService, scopes: Scopes) {
  return new Hono<ScopeEnv>().post(
    "/from-message",
    v("json", crmFromMessage),
    scopes.workspace("json"),
    async (c) => respond(c, await service.create(c.var.scope, c.req.valid("json"))),
  );
}
