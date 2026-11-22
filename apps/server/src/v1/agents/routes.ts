import {
  saveAgentTriggersInput,
  saveAgentInput,
  deleteAgentInput,
  setAgentPictureInput,
} from "@substrate/contracts/agents";

import { respond, v } from "../../shared/http";
import type { ScopeEnv, Scopes } from "../../shared/scope";
import type { UserScope } from "../../shared/scope-types";
import type { AgentService } from "./service";
import { Hono } from "hono";

export function createAgentsRoutes(services: AgentService, scopes: Scopes) {
  return new Hono<ScopeEnv<UserScope>>()
    .post("/list", scopes.user(), async (c) => respond(c, await services.listAgents(c.var.scope)))
    .post("/actors/save", v("json", saveAgentInput), scopes.user(), async (c) =>
      respond(c, await services.saveAgent(c.var.scope, c.req.valid("json"))),
    )
    .post("/actors/delete", v("json", deleteAgentInput), scopes.user(), async (c) =>
      respond(c, await services.deleteAgent(c.var.scope, c.req.valid("json"))),
    )
    .post("/actors/picture", v("json", setAgentPictureInput), scopes.user(), async (c) =>
      respond(c, await services.setAgentPicture(c.var.scope, c.req.valid("json"))),
    )
    .post("/actors/triggers", v("json", saveAgentTriggersInput), scopes.user(), async (c) =>
      respond(c, await services.saveAgentTriggers(c.var.scope, c.req.valid("json"))),
    )
    .post("/actors/home", v("json", deleteAgentInput), scopes.user(), async (c) =>
      respond(c, await services.setAgentHomeDevice(c.var.scope, c.req.valid("json"))),
    );
}
