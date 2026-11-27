import { respond } from "../../shared/http";
import type { ScopeEnv, Scopes } from "../../shared/scope";
import type { UserScope } from "../../shared/scope-types";
import type { AttentionService } from "./service";
import { Hono } from "hono";

export function createAttentionRoutes(service: AttentionService, scopes: Scopes) {
  return new Hono<ScopeEnv<UserScope>>().get("/", scopes.user(), async (c) =>
    respond(c, await service.summary(c.var.scope)),
  );
}
