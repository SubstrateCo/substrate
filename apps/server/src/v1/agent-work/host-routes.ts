import {
  hostClaimInput,
  hostFinishInput,
  hostParams,
  hostProgressInput,
  hostRecoverInput,
  hostRetryLaterInput,
  hostStartInput,
  hostSteerInput,
  hostSteerResultInput,
  hostSubmitItemInput,
  hostSyncInput,
} from "@substrate/contracts/agent-work/control";

import { respond, v } from "../../shared/http";
import type { ScopeEnv, Scopes } from "../../shared/scope";
import type { DeviceScope } from "../../shared/scope-types";
import type { HostService } from "./host-service";
import { Hono } from "hono";

/** /agent-work/host/*: every call resolves the host through the device scope. */
export function createHostRoutes(host: HostService, scopes: Scopes) {
  return new Hono<ScopeEnv<DeviceScope>>()
    .post("/host/claim", v("json", hostClaimInput), scopes.device("json"), async (c) =>
      respond(c, await host.claim(c.var.scope, c.req.valid("json"))),
    )
    .post("/host/sync", v("json", hostSyncInput), scopes.device("json"), async (c) =>
      respond(c, await host.sync(c.var.scope)),
    )
    .post(
      "/host/turns/:id/start",
      v("param", hostParams),
      v("json", hostStartInput),
      scopes.device("json"),
      async (c) =>
        respond(c, await host.start(c.var.scope, c.req.valid("param").id, c.req.valid("json"))),
    )
    .post(
      "/host/turns/:id/progress",
      v("param", hostParams),
      v("json", hostProgressInput),
      scopes.device("json"),
      async (c) =>
        respond(c, await host.progress(c.var.scope, c.req.valid("param").id, c.req.valid("json"))),
    )
    .post(
      "/host/turns/:id/finish",
      v("param", hostParams),
      v("json", hostFinishInput),
      scopes.device("json"),
      async (c) =>
        respond(c, await host.finish(c.var.scope, c.req.valid("param").id, c.req.valid("json"))),
    )
    .post(
      "/host/turns/:id/retry-later",
      v("param", hostParams),
      v("json", hostRetryLaterInput),
      scopes.device("json"),
      async (c) =>
        respond(
          c,
          await host.retryLater(c.var.scope, c.req.valid("param").id, c.req.valid("json")),
        ),
    )
    .post(
      "/host/turns/:id/recover",
      v("param", hostParams),
      v("json", hostRecoverInput),
      scopes.device("json"),
      async (c) =>
        respond(c, await host.recover(c.var.scope, c.req.valid("param").id, c.req.valid("json"))),
    )
    .post(
      "/host/turns/:id/steer",
      v("param", hostParams),
      v("json", hostSteerInput),
      scopes.device("json"),
      async (c) =>
        respond(c, await host.steer(c.var.scope, c.req.valid("param").id, c.req.valid("json"))),
    )
    .post(
      "/host/items/:id/steer-result",
      v("param", hostParams),
      v("json", hostSteerResultInput),
      scopes.device("json"),
      async (c) =>
        respond(
          c,
          await host.steerResult(c.var.scope, c.req.valid("param").id, c.req.valid("json")),
        ),
    )
    .post("/host/items", v("json", hostSubmitItemInput), scopes.device("json"), async (c) =>
      respond(c, await host.submitItem(c.var.scope, c.req.valid("json"))),
    );
}
