import {
  ackWakesInput,
  callsLogInput,
  closeRequestInput,
  conversationRequestsInput,
  decideInvocationInput,
  decideProposalInput,
  deviceHeartbeatInput,
  invocationParams,
  listInvocationsInput,
  myCallsInput,
  openRequestInput,
  ownerScopeInput,
  publishStatusInput,
  pullWakesInput,
  registerDeviceInput,
  requestAnswersInput,
  requestParams,
  respondRequestInput,
  sourcesInput,
} from "@substrate/contracts/agent-work";

import { respond, v } from "../../shared/http";
import type { DeviceScope, ScopeEnv, Scopes, UserScope } from "../../shared/scope";
import type { DeviceService } from "./device-service";
import type { AgentWorkService } from "./service";
import { Hono } from "hono";

export function createAgentWorkRoutes(
  service: AgentWorkService,
  device: DeviceService,
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
    )
    .get("/invocations", v("query", listInvocationsInput), scopes.workspace("query"), async (c) =>
      respond(c, await service.listInvocations(c.var.scope, c.req.valid("query"))),
    )
    .post(
      "/invocations/:id/decide",
      v("param", invocationParams),
      v("json", decideInvocationInput),
      scopes.workspace("json"),
      async (c) =>
        respond(
          c,
          await service.decideInvocation(c.var.scope, c.req.valid("param").id, c.req.valid("json")),
        ),
    )
    .get("/calls", v("query", callsLogInput), scopes.workspace("query"), async (c) =>
      respond(c, await service.listCallsLog(c.var.scope, c.req.valid("query"))),
    )
    .get("/calls/mine", v("query", myCallsInput), scopes.workspace("query"), async (c) =>
      respond(c, await service.listMyCalls(c.var.scope, c.req.valid("query"))),
    );
  const registration = new Hono<ScopeEnv<UserScope>>()
    .post("/device/register", v("json", registerDeviceInput), scopes.user(), async (c) =>
      respond(c, await device.registerDevice(c.var.scope, c.req.valid("json"))),
    )
    .post(
      "/device/heartbeat",
      v("json", deviceHeartbeatInput),
      scopes.registeredUserDevice("json"),
      async (c) => respond(c, await device.deviceHeartbeat(c.var.scope, c.req.valid("json"))),
    );
  const desktop = new Hono<ScopeEnv<DeviceScope>>()
    .post("/device/wakes/pull", v("json", pullWakesInput), scopes.device("json"), async (c) =>
      respond(c, await device.pullWakes(c.var.scope, c.req.valid("json"))),
    )
    .post("/device/wakes/ack", v("json", ackWakesInput), scopes.device("json"), async (c) =>
      respond(c, await device.ackWakes(c.var.scope, c.req.valid("json"))),
    )
    .post("/device/sources", v("json", sourcesInput), scopes.device("json"), async (c) =>
      respond(c, await device.loadSources(c.var.scope, c.req.valid("json"))),
    )
    .post("/device/status", v("json", publishStatusInput), scopes.device("json"), async (c) =>
      respond(c, await device.publishStatus(c.var.scope, c.req.valid("json"))),
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
    );
  return new Hono().route("/", owner).route("/", registration).route("/", desktop);
}
