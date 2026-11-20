import { invitationParams, organizationWorkspace } from "@substrate/contracts/organizations/input";

import { respond, v } from "../../shared/http";
import type { ScopeEnv, Scopes, SettingsScope } from "../../shared/scope";
import type { OrganizationService } from "./service";
import { Hono } from "hono";

export function createOrganizationRoutes(service: OrganizationService, scopes: Scopes) {
  const settings = new Hono<ScopeEnv<SettingsScope>>().get(
    "/settings-access",
    scopes.settings(),
    async (c) => respond(c, await service.settingsAccess(c.var.scope)),
  );
  const workspace = new Hono<ScopeEnv>()
    .get("/current", v("query", organizationWorkspace), scopes.workspace("query"), async (c) =>
      respond(c, await service.current(c.var.scope)),
    )
    .get("/people", v("query", organizationWorkspace), scopes.workspace("query"), async (c) =>
      respond(c, await service.people(c.var.scope)),
    )
    .get(
      "/invitations/:invitationId/link",
      v("param", invitationParams),
      v("query", organizationWorkspace),
      scopes.workspace("query"),
      async (c) =>
        respond(c, await service.invitationLink(c.var.scope, c.req.valid("param").invitationId)),
    );
  return new Hono().route("/", settings).route("/", workspace);
}
