import {
  contactInteractionList,
  interactionWrite,
  interactionPeriod,
  interactionTimeline,
  interactionRecord,
  interactionDirectory,
  interactionProfile,
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
    .get("/directory", v("query", interactionDirectory), scopes.workspace("query"), async (c) =>
      respond(c, await service.directory(c.var.scope, c.req.valid("query"))),
    )
    .get("/record", v("query", interactionRecord), scopes.workspace("query"), async (c) =>
      respond(c, await service.record(c.var.scope, c.req.valid("query").entityId)),
    )
    .get("/profile", v("query", interactionProfile), scopes.workspace("query"), async (c) =>
      respond(
        c,
        await service.profile(
          c.var.scope,
          c.req.valid("query").entityId,
          c.req.valid("query").type,
        ),
      ),
    )
    .get("/activity", v("query", interactionPeriod), scopes.workspace("query"), async (c) =>
      respond(c, await service.activity(c.var.scope, c.req.valid("query"))),
    )
    .get("/timeline", v("query", interactionTimeline), scopes.workspace("query"), async (c) =>
      respond(c, await service.timeline(c.var.scope, c.req.valid("query"))),
    )
    .get("/", v("query", contactInteractionList), scopes.workspace("query"), async (c) =>
      respond(c, await service.list(c.var.scope, c.req.valid("query").contactEntityId)),
    )
    .post("/mutations", v("json", interactionWrite), scopes.workspace("json"), async (c) =>
      respond(c, await service.mutate(c.var.scope, c.req.valid("json"))),
    );
}
