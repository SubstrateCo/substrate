import {
  agentRunInput,
  claimRunsInput,
  closeRequestInput,
  conversationRunsInput,
  deliveriesInput,
  finishRunInput,
  heartbeatInput,
  openRequestInput,
  registerDeviceInput,
  respondRequestInput,
  runEventsInput,
  runSessionInput,
} from "@startup-os/contracts/agent-runs";
import { workspaceInput } from "@startup-os/contracts/messaging/input";

import { respond, validationHook } from "../../shared/http";
import * as defaultServices from "./service";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

export function createAgentRunsRoutes(services = defaultServices) {
  return (
    new Hono()
      // The owner's views and actions.
      .get("/conversation", zValidator("query", conversationRunsInput, validationHook), async (c) =>
        respond(c, await services.listConversationRuns(c.req.raw.headers, c.req.valid("query"))),
      )
      .get("/active", zValidator("query", workspaceInput, validationHook), async (c) =>
        respond(c, await services.listActiveRuns(c.req.raw.headers, c.req.valid("query"))),
      )
      .get("/run", zValidator("query", agentRunInput, validationHook), async (c) =>
        respond(c, await services.getRun(c.req.raw.headers, c.req.valid("query"))),
      )
      .post("/cancel", zValidator("json", agentRunInput, validationHook), async (c) =>
        respond(c, await services.cancelRun(c.req.raw.headers, c.req.valid("json"))),
      )
      .post("/respond", zValidator("json", respondRequestInput, validationHook), async (c) =>
        respond(c, await services.respondToRequest(c.req.raw.headers, c.req.valid("json"))),
      )
      // The desktop runner.
      .post(
        "/device/register",
        zValidator("json", registerDeviceInput, validationHook),
        async (c) =>
          respond(c, await services.registerDevice(c.req.raw.headers, c.req.valid("json"))),
      )
      .post("/device/claim", zValidator("json", claimRunsInput, validationHook), async (c) =>
        respond(c, await services.claimRuns(c.req.raw.headers, c.req.valid("json"))),
      )
      .post("/device/heartbeat", zValidator("json", heartbeatInput, validationHook), async (c) =>
        respond(c, await services.heartbeat(c.req.raw.headers, c.req.valid("json"))),
      )
      .post("/device/events", zValidator("json", runEventsInput, validationHook), async (c) =>
        respond(c, await services.appendEvents(c.req.raw.headers, c.req.valid("json"))),
      )
      .post("/device/session", zValidator("json", runSessionInput, validationHook), async (c) =>
        respond(c, await services.recordSession(c.req.raw.headers, c.req.valid("json"))),
      )
      .post(
        "/device/requests/open",
        zValidator("json", openRequestInput, validationHook),
        async (c) => respond(c, await services.openRequest(c.req.raw.headers, c.req.valid("json"))),
      )
      .post(
        "/device/requests/close",
        zValidator("json", closeRequestInput, validationHook),
        async (c) =>
          respond(c, await services.closeRequest(c.req.raw.headers, c.req.valid("json"))),
      )
      .post("/device/deliveries", zValidator("json", deliveriesInput, validationHook), async (c) =>
        respond(c, await services.pendingDeliveries(c.req.raw.headers, c.req.valid("json"))),
      )
      .post("/device/finish", zValidator("json", finishRunInput, validationHook), async (c) =>
        respond(c, await services.finishRun(c.req.raw.headers, c.req.valid("json"))),
      )
  );
}
