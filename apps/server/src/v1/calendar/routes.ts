import {
  calendarConnect,
  calendarEventParams,
  calendarEventRange,
  calendarParams,
  calendarUpdate,
  calendarWorkspace,
  contactMeetings,
  contactParams,
  interactionSourceEvents,
  providerAccountParams,
} from "@substrate/contracts/calendar/input";

import { respond, v } from "../../shared/http";
import type { ScopeEnv, Scopes } from "../../shared/scope";
import type { CalendarService } from "./service";
import { Hono } from "hono";

export function createCalendarRoutes(service: CalendarService, scopes: Scopes) {
  return new Hono<ScopeEnv>()
    .get("/settings", v("query", calendarWorkspace), scopes.workspace("query"), async (c) =>
      respond(c, await service.settings(c.var.scope)),
    )
    .get(
      "/accounts/:credentialAccountId/calendars",
      v("param", providerAccountParams),
      v("query", calendarWorkspace),
      scopes.workspace("query"),
      async (c) =>
        respond(
          c,
          await service.providerCalendars(c.var.scope, c.req.valid("param").credentialAccountId),
        ),
    )
    .post("/connect", v("json", calendarConnect), scopes.workspace("json"), async (c) =>
      respond(c, await service.connect(c.var.scope, c.req.valid("json"))),
    )
    .patch(
      "/calendars/:calendarEntityId",
      v("param", calendarParams),
      v("json", calendarUpdate),
      scopes.workspace("json"),
      async (c) => {
        const { organizationId: _, ...settings } = c.req.valid("json");
        return respond(
          c,
          await service.update(c.var.scope, { ...settings, ...c.req.valid("param") }),
        );
      },
    )
    .post(
      "/calendars/:calendarEntityId/disconnect",
      v("param", calendarParams),
      v("json", calendarWorkspace),
      scopes.workspace("json"),
      async (c) =>
        respond(c, await service.disconnect(c.var.scope, c.req.valid("param").calendarEntityId)),
    )
    .post(
      "/calendars/:calendarEntityId/backfill",
      v("param", calendarParams),
      v("json", calendarWorkspace),
      scopes.workspace("json"),
      async (c) =>
        respond(c, await service.backfill(c.var.scope, c.req.valid("param").calendarEntityId)),
    )
    .get("/events", v("query", calendarEventRange), scopes.workspace("query"), async (c) => {
      const { organizationId: _, ...range } = c.req.valid("query");
      return respond(c, await service.events(c.var.scope, range));
    })
    .get(
      "/events/:entityId",
      v("param", calendarEventParams),
      v("query", calendarWorkspace),
      scopes.workspace("query"),
      async (c) => respond(c, await service.event(c.var.scope, c.req.valid("param").entityId)),
    )
    .get(
      "/contacts/:contactEntityId/meetings",
      v("param", contactParams),
      v("query", contactMeetings),
      scopes.workspace("query"),
      async (c) =>
        respond(
          c,
          await service.contactMeetings(c.var.scope, {
            ...c.req.valid("param"),
            limit: c.req.valid("query").limit,
          }),
        ),
    )
    .post(
      "/interaction-sources",
      v("json", interactionSourceEvents),
      scopes.workspace("json"),
      async (c) =>
        respond(
          c,
          await service.interactionSources(c.var.scope, c.req.valid("json").interactionEntityIds),
        ),
    );
}
