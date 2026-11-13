import {
  contextWorkspace,
  contextEntity,
  contextMessage,
  contextMessagePage,
  contextTarget,
  contextTargets,
  contextLink,
  contextSearch,
  contextSourceTask,
  contextNotification,
  contextNotificationPage,
} from "@substrate/contracts/context/input";
import {
  notificationGroupsInput,
  notificationGroupEventsInput,
  notificationGroupReadInput,
} from "@substrate/contracts/context/notification-groups";
import { failure } from "@substrate/contracts/result";

import { respond, v } from "../../shared/http";
import type { ScopeEnv, Scopes } from "../../shared/scope";
import type { ContextService } from "./service";
import { Hono } from "hono";
import type { UnofficialStatusCode } from "hono/utils/http-status";

export function createContextRoutes(services: ContextService, scopes: Scopes) {
  return new Hono<ScopeEnv>()
    .post("/message-page", v("json", contextMessagePage), scopes.workspace("json"), async (c) =>
      respond(c, await services.getMessagePage(c.var.scope, c.req.valid("json"))),
    )
    .get("/message-links", v("query", contextMessage), scopes.workspace("query"), async (c) =>
      respond(c, await services.getMessageLinks(c.var.scope, c.req.valid("query"))),
    )
    .get("/message-people", v("query", contextMessage), scopes.workspace("query"), async (c) =>
      respond(c, await services.getMessagePeople(c.var.scope, c.req.valid("query"))),
    )
    .get("/related", v("query", contextEntity), scopes.workspace("query"), async (c) =>
      respond(c, await services.getRelatedContext(c.var.scope, c.req.valid("query"))),
    )
    .get("/message-target", v("query", contextTarget), scopes.workspace("query"), async (c) =>
      respond(c, await services.getMessageTarget(c.var.scope, c.req.valid("query"))),
    )
    .post("/message-targets", v("json", contextTargets), scopes.workspace("json"), async (c) =>
      respond(c, await services.getMessageTargets(c.var.scope, c.req.valid("json"))),
    )
    .post("/search", v("json", contextSearch), scopes.workspace("json"), async (c) => {
      const signal = c.req.raw.signal;
      try {
        return respond(c, await services.searchContext(c.var.scope, c.req.valid("json"), signal));
      } catch (error) {
        if (signal.aborted) {
          // SAFETY: Hono uses this marker for unofficial statuses; 499 means client cancellation.
          return c.json(
            failure("INVALID_INPUT", "Request cancelled."),
            499 as UnofficialStatusCode,
          );
        }
        throw error;
      }
    })
    .post("/source-tasks", v("json", contextSourceTask), scopes.workspace("json"), async (c) =>
      respond(c, await services.createTaskFromMessage(c.var.scope, c.req.valid("json"))),
    )
    .post("/links", v("json", contextLink), scopes.workspace("json"), async (c) =>
      respond(c, await services.attachWork(c.var.scope, c.req.valid("json"))),
    )
    .delete("/links", v("json", contextLink), scopes.workspace("json"), async (c) =>
      respond(c, await services.detachWork(c.var.scope, c.req.valid("json"))),
    )
    .get("/activity", v("query", contextEntity), scopes.workspace("query"), async (c) =>
      respond(c, await services.getActivity(c.var.scope, c.req.valid("query"))),
    )
    .get("/notifications", v("query", contextWorkspace), scopes.workspace("query"), async (c) =>
      respond(c, await services.getNotifications(c.var.scope, c.req.valid("query"))),
    )
    .get(
      "/notifications/groups",
      v("query", notificationGroupsInput),
      scopes.workspace("query"),
      async (c) =>
        respond(c, await services.getNotificationGroups(c.var.scope, c.req.valid("query"))),
    )
    .get(
      "/notifications/events",
      v("query", notificationGroupEventsInput),
      scopes.workspace("query"),
      async (c) =>
        respond(c, await services.getNotificationGroupEvents(c.var.scope, c.req.valid("query"))),
    )
    .get(
      "/notifications/unread",
      v("query", contextWorkspace),
      scopes.workspace("query"),
      async (c) =>
        respond(c, await services.getNotificationUnread(c.var.scope, c.req.valid("query"))),
    )
    .post(
      "/notifications/read-group",
      v("json", notificationGroupReadInput),
      scopes.workspace("json"),
      async (c) =>
        respond(c, await services.markNotificationGroupRead(c.var.scope, c.req.valid("json"))),
    )
    .get(
      "/notifications/page",
      v("query", contextNotificationPage),
      scopes.workspace("query"),
      async (c) =>
        respond(c, await services.getNotificationPage(c.var.scope, c.req.valid("query"))),
    )
    .post(
      "/notifications/read-all",
      v("json", contextWorkspace),
      scopes.workspace("json"),
      async (c) => respond(c, await services.markAllRead(c.var.scope, c.req.valid("json"))),
    )
    .post(
      "/notifications/read",
      v("json", contextNotification),
      scopes.workspace("json"),
      async (c) => respond(c, await services.markRead(c.var.scope, c.req.valid("json"))),
    );
}
