import { crmRecord, crmWorkspace } from "@substrate/contracts/crm/input";
import { crmLink, crmLinks } from "@substrate/contracts/crm/links";

import { respond, v } from "../../shared/http";
import type { ScopeEnv, Scopes } from "../../shared/scope";
import type { CrmService } from "./service";
import { Hono } from "hono";

export function createCrmManagementRoutes(service: CrmService, scopes: Scopes) {
  return new Hono<ScopeEnv>()
    .get("/links", v("query", crmLinks), scopes.workspace("query"), async (c) =>
      respond(c, await service.recordLinks(c.var.scope, c.req.valid("query").entityId)),
    )
    .post("/links", v("json", crmLink), scopes.workspace("json"), async (c) =>
      respond(c, await service.changeRecordLink(c.var.scope, c.req.valid("json"), false)),
    )
    .delete("/links", v("json", crmLink), scopes.workspace("json"), async (c) =>
      respond(c, await service.changeRecordLink(c.var.scope, c.req.valid("json"), true)),
    )
    .get("/people", v("query", crmWorkspace), scopes.workspace("query"), async (c) =>
      respond(c, await service.people(c.var.scope)),
    )
    .get("/grants", v("query", crmRecord), scopes.workspace("query"), async (c) =>
      respond(c, await service.grants(c.var.scope, c.req.valid("query").entityId)),
    );
}
