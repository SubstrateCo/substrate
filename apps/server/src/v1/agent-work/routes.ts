import {
  ackWakesInput,
  closeRequestInput,
  conversationRequestsInput,
  decideProposalInput,
  deviceHeartbeatInput,
  openRequestInput,
  ownerScopeInput,
  publishStatusInput,
  pullWakesInput,
  registerDeviceInput,
  requestAnswersInput,
  requestParams,
  respondRequestInput,
  sourcesInput,
} from "@startup-os/contracts/agent-work";

import { respond, validationHook } from "../../shared/http";
import {
  ackWakes,
  closeRequest,
  deviceHeartbeat,
  loadSources,
  openRequest,
  publishStatus,
  pullWakes,
  registerDevice,
  requestAnswers,
} from "./device-service";
import {
  approveProposal,
  declineProposal,
  listConversationRequests,
  listNeedsYou,
  listStatus,
  respondToRequest,
} from "./service";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

export function createAgentWorkRoutes() {
  return (
    new Hono()
      // The owner's views and decisions, from any of their devices.
      .get("/requests", zValidator("query", conversationRequestsInput, validationHook), async (c) =>
        respond(c, await listConversationRequests(c.req.raw.headers, c.req.valid("query"))),
      )
      .get("/needs-you", zValidator("query", ownerScopeInput, validationHook), async (c) =>
        respond(c, await listNeedsYou(c.req.raw.headers, c.req.valid("query"))),
      )
      .get("/status", zValidator("query", ownerScopeInput, validationHook), async (c) =>
        respond(c, await listStatus(c.req.raw.headers, c.req.valid("query"))),
      )
      .post(
        "/requests/:id/respond",
        zValidator("param", requestParams, validationHook),
        zValidator("json", respondRequestInput, validationHook),
        async (c) =>
          respond(
            c,
            await respondToRequest(c.req.raw.headers, c.req.valid("param").id, c.req.valid("json")),
          ),
      )
      .post(
        "/requests/:id/approve",
        zValidator("param", requestParams, validationHook),
        zValidator("json", decideProposalInput, validationHook),
        async (c) =>
          respond(
            c,
            await approveProposal(c.req.raw.headers, c.req.valid("param").id, c.req.valid("json")),
          ),
      )
      .post(
        "/requests/:id/decline",
        zValidator("param", requestParams, validationHook),
        zValidator("json", decideProposalInput, validationHook),
        async (c) =>
          respond(
            c,
            await declineProposal(c.req.raw.headers, c.req.valid("param").id, c.req.valid("json")),
          ),
      )
      // The agent's home desktop.
      .post(
        "/device/register",
        zValidator("json", registerDeviceInput, validationHook),
        async (c) => respond(c, await registerDevice(c.req.raw.headers, c.req.valid("json"))),
      )
      .post(
        "/device/heartbeat",
        zValidator("json", deviceHeartbeatInput, validationHook),
        async (c) => respond(c, await deviceHeartbeat(c.req.raw.headers, c.req.valid("json"))),
      )
      .post("/device/wakes/pull", zValidator("json", pullWakesInput, validationHook), async (c) =>
        respond(c, await pullWakes(c.req.raw.headers, c.req.valid("json"))),
      )
      .post("/device/wakes/ack", zValidator("json", ackWakesInput, validationHook), async (c) =>
        respond(c, await ackWakes(c.req.raw.headers, c.req.valid("json"))),
      )
      .post("/device/sources", zValidator("json", sourcesInput, validationHook), async (c) =>
        respond(c, await loadSources(c.req.raw.headers, c.req.valid("json"))),
      )
      .post("/device/status", zValidator("json", publishStatusInput, validationHook), async (c) =>
        respond(c, await publishStatus(c.req.raw.headers, c.req.valid("json"))),
      )
      .post("/device/requests", zValidator("json", openRequestInput, validationHook), async (c) =>
        respond(c, await openRequest(c.req.raw.headers, c.req.valid("json"))),
      )
      .post(
        "/device/requests/close",
        zValidator("json", closeRequestInput, validationHook),
        async (c) => respond(c, await closeRequest(c.req.raw.headers, c.req.valid("json"))),
      )
      .post(
        "/device/requests/answers",
        zValidator("json", requestAnswersInput, validationHook),
        async (c) => respond(c, await requestAnswers(c.req.raw.headers, c.req.valid("json"))),
      )
  );
}
