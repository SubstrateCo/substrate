import { crmExport } from "@substrate/contracts/crm/export";

import { respond, v } from "../../shared/http";
import type { ScopeEnv, Scopes } from "../../shared/scope";
import { exportCrm } from "../crm/export";
import { Hono } from "hono";
import { z } from "zod";

export function createContactsExportRoutes(scopes: Scopes) {
  return new Hono<ScopeEnv>().get(
    "/export",
    v("query", crmExport.extend({ kind: z.literal("contacts").default("contacts") })),
    scopes.workspace("query"),
    async (c) => {
      const result = await exportCrm(c.var.scope, c.req.valid("query"));
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
