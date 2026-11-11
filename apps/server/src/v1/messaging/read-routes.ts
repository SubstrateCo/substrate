import { workspaceInput } from "@substrate/contracts/messaging/input";
import { conversationReadInput } from "@substrate/contracts/messaging/read-state";

import { respond, v } from "../../shared/http";
import type { ScopeEnv, Scopes } from "../../shared/scope";
import type { createReadService } from "./read-service";
import { Hono } from "hono";

export function createReadRoutes(service: ReturnType<typeof createReadService>, scopes: Scopes) {
  return new Hono<ScopeEnv>()
    .get("/unread", v("query", workspaceInput), scopes.workspace("query"), async (c) =>
      respond(c, await service.unread(c.var.scope)),
    )
    .post("/read", v("json", conversationReadInput), scopes.workspace("json"), async (c) =>
      respond(c, await service.markRead(c.var.scope, c.req.valid("json"))),
    );
}
