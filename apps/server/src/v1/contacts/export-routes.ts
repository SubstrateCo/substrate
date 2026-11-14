import { contactsExport } from "@substrate/contracts/crm/export";

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
      const result = await service.export(c.var.scope, c.req.valid("query"));
      if (!result.success) return respond(c, result);
      return c.body(result.data, 200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="contacts.csv"',
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
    },
  );
}
