import { crmRecord, crmWorkspace } from "@substrate/contracts/crm/input";

import { respond, v } from "../../shared/http";
import type { ScopeEnv, Scopes } from "../../shared/scope";
import type { CrmService } from "./service";
import { Hono } from "hono";

export function createCrmManagementRoutes(service: CrmService, scopes: Scopes) {
  return new Hono<ScopeEnv>()
    .get("/people", v("query", crmWorkspace), scopes.workspace("query"), async (c) =>
      respond(c, await service.people(c.var.scope)),
    )
    .get("/grants", v("query", crmRecord), scopes.workspace("query"), async (c) =>
      respond(c, await service.grants(c.var.scope, c.req.valid("query").entityId)),
    );
}
