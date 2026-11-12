import { crmActivityList } from "@substrate/contracts/crm/activity";
import {
  crmWorkspace,
  crmList,
  crmRecord,
  crmContact,
  crmReport,
  crmIdentifierSearch,
  crmWrite,
  crmTimeline,
} from "@substrate/contracts/crm/input";
import { crmReportDeals } from "@substrate/contracts/crm/report-input";

import { respond, v } from "../../shared/http";
import type { ScopeEnv, Scopes } from "../../shared/scope";
import { createCrmExportRoutes } from "./export";
import { createCrmManagementRoutes } from "./management";
import type { CrmService } from "./service";
import { Hono } from "hono";

export function createCrmRoutes(service: CrmService, scopes: Scopes) {
  return new Hono<ScopeEnv>()
    .route("/", createCrmExportRoutes(scopes))
    .route("/", createCrmManagementRoutes(scopes))
    .get("/activity", v("query", crmActivityList), scopes.workspace("query"), async (c) => {
      const input = c.req.valid("query");
      return respond(
        c,
        await service.activity(c.var.scope, input.entityId, {
          limit: input.limit,
          before:
            input.beforeCreatedAt && input.beforeId
              ? { createdAt: input.beforeCreatedAt, id: input.beforeId }
              : undefined,
        }),
      );
    })
    .get("/report-deals", v("query", crmReportDeals), scopes.workspace("query"), async (c) =>
      respond(c, await service.reportDeals(c.var.scope, c.req.valid("query"))),
    )
    .get("/timeline", v("query", crmTimeline), scopes.workspace("query"), async (c) =>
      respond(
        c,
        await service.timeline(c.var.scope, c.req.valid("query").entityId, c.req.valid("query")),
      ),
    )
    .get("/settings", v("query", crmWorkspace), scopes.workspace("query"), async (c) =>
      respond(c, await service.settings(c.var.scope)),
    )
    .get("/follow-ups", v("query", crmRecord), scopes.workspace("query"), async (c) =>
      respond(c, await service.followUps(c.var.scope, c.req.valid("query").entityId)),
    )
    .get("/candidates", v("query", crmIdentifierSearch), scopes.workspace("query"), async (c) =>
      respond(c, await service.candidates(c.var.scope, c.req.valid("query"))),
    )
    .get("/report", v("query", crmReport), scopes.workspace("query"), async (c) =>
      respond(
        c,
        await service.report(
          c.var.scope,
          c.req.valid("query").from,
          c.req.valid("query").to,
          c.req.valid("query"),
        ),
      ),
    )
    .get("/accounts", v("query", crmList), scopes.workspace("query"), async (c) =>
      respond(c, await service.listAccounts(c.var.scope, c.req.valid("query"))),
    )
    .get("/account", v("query", crmRecord), scopes.workspace("query"), async (c) =>
      respond(c, await service.getAccount(c.var.scope, c.req.valid("query").entityId)),
    )
    .get("/contacts", v("query", crmList), scopes.workspace("query"), async (c) =>
      respond(c, await service.listContacts(c.var.scope, c.req.valid("query"))),
    )
    .get("/contact", v("query", crmRecord), scopes.workspace("query"), async (c) =>
      respond(c, await service.getContact(c.var.scope, c.req.valid("query").entityId)),
    )
    .get("/deals", v("query", crmList), scopes.workspace("query"), async (c) =>
      respond(c, await service.listDeals(c.var.scope, c.req.valid("query"))),
    )
    .get("/deal", v("query", crmRecord), scopes.workspace("query"), async (c) =>
      respond(c, await service.getDeal(c.var.scope, c.req.valid("query").entityId)),
    )
    .get("/pipeline", v("query", crmWorkspace), scopes.workspace("query"), async (c) =>
      respond(c, await service.pipeline(c.var.scope)),
    )
    .get("/interactions", v("query", crmContact), scopes.workspace("query"), async (c) =>
      respond(c, await service.interactions(c.var.scope, c.req.valid("query").contactEntityId)),
    )
    .post("/mutations", v("json", crmWrite), scopes.workspace("json"), async (c) =>
      respond(c, await service.mutate(c.var.scope, c.req.valid("json"))),
    );
}
