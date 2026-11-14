import { crmRecordExport } from "@substrate/contracts/crm/export";

import { respond, v } from "../../shared/http";
import type { ScopeEnv, Scopes } from "../../shared/scope";
import type { CrmService } from "./service";
import { Hono } from "hono";

export function createCrmExportRoutes(service: CrmService, scopes: Scopes) {
  return new Hono<ScopeEnv>().get(
    "/export",
    v("query", crmRecordExport),
    scopes.workspace("query"),
    async (c) => {
      const input = c.req.valid("query");
      const result = await service.export(c.var.scope, input);
      if (!result.success) return respond(c, result);
      return c.body(result.data, 200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="crm-${input.kind}.csv"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
    },
  );
}
