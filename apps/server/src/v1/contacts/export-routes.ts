import { contactsExport } from "@substrate/contracts/crm/export";

import { exportResponse } from "../../shared/export";
import { respond, v } from "../../shared/http";
import type { ScopeEnv, Scopes } from "../../shared/scope";
import type { ContactsService } from "./service";
import { Hono } from "hono";

export function createContactsExportRoutes(service: ContactsService, scopes: Scopes) {
  return new Hono<ScopeEnv>().get(
    "/export",
    v("query", contactsExport),
    scopes.workspace("query"),
    async (c) => {
      const input = c.req.valid("query");
      const result = await service.export(c.var.scope, input);
      if (!result.success) return respond(c, result);
      return exportResponse(c, result.data, input.format ?? "csv", "contacts");
    },
  );
}
