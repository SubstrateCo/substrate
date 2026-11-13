import {
  contactInteractionList,
  interactionWrite,
} from "@substrate/contracts/context/interactions";

import { respond, v } from "../../shared/http";
import type { ScopeEnv, Scopes } from "../../shared/scope";
import type { ContactInteractionsService } from "./interactions-service";
import { Hono } from "hono";

export function createContactInteractionsRoutes(
  service: ContactInteractionsService,
  scopes: Scopes,
) {
  return new Hono<ScopeEnv>()
    .get("/", v("query", contactInteractionList), scopes.workspace("query"), async (c) =>
      respond(c, await service.list(c.var.scope, c.req.valid("query").contactEntityId)),
    )
    .post("/mutations", v("json", interactionWrite), scopes.workspace("json"), async (c) =>
      respond(c, await service.mutate(c.var.scope, c.req.valid("json"))),
    );
}
