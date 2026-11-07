import {
  contextWorkspace,
  contextEntity,
  contextMessage,
  contextTarget,
  contextLink,
  contextSearch,
  contextSourceTask,
  contextNotification,
} from "@startup-os/contracts/context/input";

import { respond, validationHook } from "../../shared/http";
import * as defaultServices from "./service";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

export function createContextRoutes(services = defaultServices) {
  return new Hono()
    .get("/message-links", zValidator("query", contextMessage, validationHook), async (c) =>
      respond(c, await services.getMessageLinks(c.req.raw.headers, c.req.valid("query"))),
    )
    .get("/message-people", zValidator("query", contextMessage, validationHook), async (c) =>
      respond(c, await services.getMessagePeople(c.req.raw.headers, c.req.valid("query"))),
    )
    .get("/related", zValidator("query", contextEntity, validationHook), async (c) =>
      respond(c, await services.getRelatedContext(c.req.raw.headers, c.req.valid("query"))),
    )
    .get("/message-target", zValidator("query", contextTarget, validationHook), async (c) =>
      respond(c, await services.getMessageTarget(c.req.raw.headers, c.req.valid("query"))),
    )
    .post("/search", zValidator("json", contextSearch, validationHook), async (c) =>
      respond(c, await services.searchContext(c.req.raw.headers, c.req.valid("json"))),
    )
    .post("/source-tasks", zValidator("json", contextSourceTask, validationHook), async (c) =>
      respond(c, await services.createTaskFromMessage(c.req.raw.headers, c.req.valid("json"))),
    )
    .post("/links", zValidator("json", contextLink, validationHook), async (c) =>
      respond(c, await services.attachWork(c.req.raw.headers, c.req.valid("json"))),
    )
    .delete("/links", zValidator("json", contextLink, validationHook), async (c) =>
      respond(c, await services.detachWork(c.req.raw.headers, c.req.valid("json"))),
    )
    .get("/activity", zValidator("query", contextEntity, validationHook), async (c) =>
      respond(c, await services.getActivity(c.req.raw.headers, c.req.valid("query"))),
    )
    .get("/notifications", zValidator("query", contextWorkspace, validationHook), async (c) =>
      respond(c, await services.getNotifications(c.req.raw.headers, c.req.valid("query"))),
    )
    .post(
      "/notifications/read-all",
      zValidator("json", contextWorkspace, validationHook),
      async (c) => respond(c, await services.markAllRead(c.req.raw.headers, c.req.valid("json"))),
    )
    .post(
      "/notifications/read",
      zValidator("json", contextNotification, validationHook),
      async (c) => respond(c, await services.markRead(c.req.raw.headers, c.req.valid("json"))),
    );
}
