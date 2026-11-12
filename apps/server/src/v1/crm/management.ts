import { crmRecord, crmWorkspace } from "@substrate/contracts/crm/input";

import { respond, v } from "../../shared/http";
import type { ScopeEnv, Scopes, WorkspaceScope } from "../../shared/scope";
import { serviceResult } from "../../shared/service-result";
import { Hono } from "hono";

export function createCrmManagementService() {
  return {
    people: (scope: WorkspaceScope) => serviceResult(() => scope.repositories.crm.people()),
    grants: (scope: WorkspaceScope, entityId: string) =>
      serviceResult(() => scope.repositories.crm.grants(entityId)),
  };
}

export function createCrmManagementRoutes(scopes: Scopes) {
  const service = createCrmManagementService();
  return new Hono<ScopeEnv>()
    .get("/people", v("query", crmWorkspace), scopes.workspace("query"), async (c) =>
      respond(c, await service.people(c.var.scope)),
    )
    .get("/grants", v("query", crmRecord), scopes.workspace("query"), async (c) =>
      respond(c, await service.grants(c.var.scope, c.req.valid("query").entityId)),
    );
}
