import {
  saveAgentTriggersInput,
  saveAgentInput,
  deleteAgentInput,
  setAgentAvatarInput,
} from "@substrate/contracts/agents";
import { searchSkillsInput } from "@substrate/contracts/agents/skill-catalog";

import { respond, v } from "../../shared/http";
import type { ScopeEnv, Scopes } from "../../shared/scope";
import type { UserScope } from "../../shared/scope-types";
import type { AgentService } from "./service";
import type { SkillCatalogService } from "./skill-catalog-service";
import { Hono } from "hono";

export function createAgentsRoutes(
  services: AgentService,
  scopes: Scopes,
  skills: SkillCatalogService,
) {
  return new Hono<ScopeEnv<UserScope>>()
    .post("/skills/search", v("json", searchSkillsInput), scopes.user(), async (c) => {
      const reply = await skills.search(c.var.scope.userId, c.req.valid("json").query);
      if (reply.retryAfterSeconds) {
        c.header("Retry-After", String(reply.retryAfterSeconds));
        c.header("X-RateLimit-Remaining", "0");
      }
      return respond(c, reply.result);
    })
    .post("/list", scopes.user(), async (c) => respond(c, await services.listAgents(c.var.scope)))
    .post("/actors/save", v("json", saveAgentInput), scopes.user(), async (c) =>
      respond(c, await services.saveAgent(c.var.scope, c.req.valid("json"))),
    )
    .post("/actors/delete", v("json", deleteAgentInput), scopes.user(), async (c) =>
      respond(c, await services.deleteAgent(c.var.scope, c.req.valid("json"))),
    )
    .post("/actors/avatar", v("json", setAgentAvatarInput), scopes.user(), async (c) =>
      respond(c, await services.setAgentAvatar(c.var.scope, c.req.valid("json"))),
    )
    .post("/actors/triggers", v("json", saveAgentTriggersInput), scopes.user(), async (c) =>
      respond(c, await services.saveAgentTriggers(c.var.scope, c.req.valid("json"))),
    )
    .post("/actors/home", v("json", deleteAgentInput), scopes.user(), async (c) =>
      respond(c, await services.setAgentHomeDevice(c.var.scope, c.req.valid("json"))),
    );
}
