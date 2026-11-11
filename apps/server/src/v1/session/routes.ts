import { respond } from "../../shared/http";
import type { ScopeEnv, Scopes, SessionScope } from "../../shared/scope";
import type { SessionService } from "./service";
import { Hono } from "hono";

export function createSessionRoutes(service: SessionService, scopes: Scopes) {
  return new Hono<ScopeEnv<SessionScope>>().get("/", scopes.session(), async (c) =>
    respond(c, await service.read(c.var.scope)),
  );
}
