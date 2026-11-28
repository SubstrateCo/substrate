import {
  closeRequestInput,
  conversationRequestsInput,
  decideProposalInput,
  deviceHeartbeatInput,
  openRequestInput,
  ownerScopeInput,
  placeAccessInput,
  registerDeviceInput,
  requestAnswersInput,
  requestParams,
  respondRequestInput,
  sourcesInput,
} from "@substrate/contracts/agent-work";

import { respond, v } from "../../shared/http";
import type { ScopeEnv, Scopes } from "../../shared/scope";
import type { DeviceScope, UserScope } from "../../shared/scope-types";
import type { DeviceService } from "./device-service";
import { createHostRoutes } from "./host-routes";
import type { HostService } from "./host-service";
import type { AgentWorkService } from "./service";
import { createWorkRoutes } from "./work-routes";
import type { WorkService } from "./work-service";
import { Hono } from "hono";

export function createAgentWorkRoutes(
  service: AgentWorkService,
  device: DeviceService,
  host: HostService,
  work: WorkService,
  scopes: Scopes,
) {
  const owner = new Hono<ScopeEnv>()
    .get("/requests", v("query", conversationRequestsInput), scopes.workspace("query"), async (c) =>
      respond(c, await service.listConversationRequests(c.var.scope, c.req.valid("query"))),
    )
    .get("/needs-you", v("query", ownerScopeInput), scopes.workspace("query"), async (c) =>
      respond(c, await service.listNeedsYou(c.var.scope, c.req.valid("query"))),
    )
    .get("/status", v("query", ownerScopeInput), scopes.workspace("query"), async (c) =>
      respond(c, await service.listStatus(c.var.scope, c.req.valid("query"))),
    )
    .post(
      "/requests/:id/respond",
      v("param", requestParams),
      v("json", respondRequestInput),
      scopes.workspace("json"),
      async (c) =>
        respond(
          c,
          await service.respondToRequest(c.var.scope, c.req.valid("param").id, c.req.valid("json")),
        ),
    )
    .post(
      "/requests/:id/approve",
      v("param", requestParams),
      v("json", decideProposalInput),
      scopes.workspace("json"),
      async (c) =>
        respond(
          c,
          await service.approveProposal(c.var.scope, c.req.valid("param").id, c.req.valid("json")),
        ),
    )
    .post(
      "/requests/:id/decline",
      v("param", requestParams),
      v("json", decideProposalInput),
      scopes.workspace("json"),
      async (c) =>
        respond(
          c,
          await service.declineProposal(c.var.scope, c.req.valid("param").id, c.req.valid("json")),
        ),
    );
  const registration = new Hono<ScopeEnv<UserScope>>().post(
    "/device/register",
    v("json", registerDeviceInput),
    scopes.user(),
    async (c) => respond(c, await device.registerDevice(c.var.scope, c.req.valid("json"))),
  );
  const heartbeat = new Hono<ScopeEnv<UserScope>>().post(
    "/device/heartbeat",
    v("json", deviceHeartbeatInput),
    scopes.installation("json"),
    async (c) => respond(c, await device.deviceHeartbeat(c.var.scope, c.req.valid("json"))),
  );
  const desktop = new Hono<ScopeEnv<DeviceScope>>()
    .post("/device/sources", v("json", sourcesInput), scopes.device("json"), async (c) =>
      respond(c, await device.loadSources(c.var.scope, c.req.valid("json"))),
    )
    .post("/device/requests", v("json", openRequestInput), scopes.device("json"), async (c) =>
      respond(c, await device.openRequest(c.var.scope, c.req.valid("json"))),
    )
    .post(
      "/device/requests/close",
      v("json", closeRequestInput),
      scopes.device("json"),
      async (c) => respond(c, await device.closeRequest(c.var.scope, c.req.valid("json"))),
    )
    .post(
      "/device/requests/answers",
      v("json", requestAnswersInput),
      scopes.device("json"),
      async (c) => respond(c, await device.requestAnswers(c.var.scope, c.req.valid("json"))),
    )
    .post("/device/place", v("json", placeAccessInput), scopes.device("json"), async (c) =>
      respond(c, await device.placeAccess(c.var.scope, c.req.valid("json"))),
    )
    .get(
      "/device/requests/:id",
      v("param", requestParams),
      v("query", requestAnswersInput),
      scopes.device("query"),
      async (c) => respond(c, await device.requestStatus(c.var.scope, c.req.valid("param").id)),
    );
  return new Hono()
    .route("/", owner)
    .route("/", createWorkRoutes(work, scopes))
    .route("/", registration)
    .route("/", heartbeat)
    .route("/", desktop)
    .route("/", createHostRoutes(host, scopes));
}
