import { respond } from "../../shared/http";
import type { ScopeEnv, Scopes, SettingsScope } from "../../shared/scope";
import type { OrganizationService } from "./service";
import { Hono } from "hono";

export function createOrganizationRoutes(service: OrganizationService, scopes: Scopes) {
  return new Hono<ScopeEnv<SettingsScope>>().get("/settings-access", scopes.settings(), async (c) =>
    respond(c, await service.settingsAccess(c.var.scope)),
  );
}
