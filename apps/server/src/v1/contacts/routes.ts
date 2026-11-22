import {
  contactsList,
  contactsRecord,
  contactIdentifierSearch,
  contactWrite,
} from "@substrate/contracts/contacts/input";

import { respond, v } from "../../shared/http";
import type { ScopeEnv, Scopes } from "../../shared/scope";
import type { ContactsService } from "./service";
import { Hono } from "hono";

export function createContactsRoutes(service: ContactsService, scopes: Scopes) {
  return new Hono<ScopeEnv>()
    .get("/", v("query", contactsList), scopes.workspace("query"), async (c) =>
      respond(c, await service.list(c.var.scope, c.req.valid("query"))),
    )
    .get("/record", v("query", contactsRecord), scopes.workspace("query"), async (c) =>
      respond(c, await service.get(c.var.scope, c.req.valid("query").entityId)),
    )
    .get("/candidates", v("query", contactIdentifierSearch), scopes.workspace("query"), async (c) =>
      respond(c, await service.candidates(c.var.scope, c.req.valid("query"))),
    )
    .post("/mutations", v("json", contactWrite), scopes.workspace("json"), async (c) =>
      respond(c, await service.mutate(c.var.scope, c.req.valid("json"))),
    );
}
