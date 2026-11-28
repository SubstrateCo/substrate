import {
  conversationNotificationParams,
  notificationWorkspace,
  updateAccountNotificationPreferences,
  updateConversationNotificationPreferences,
  updateWorkspaceNotificationPreferences,
} from "@substrate/contracts/notifications/preferences";

import { respond, v } from "../../shared/http";
import type { ScopeEnv, Scopes } from "../../shared/scope";
import type { UserScope } from "../../shared/scope-types";
import type { NotificationPreferencesService } from "./service";
import { Hono } from "hono";

export function createNotificationPreferencesRoutes(
  service: NotificationPreferencesService,
  scopes: Scopes,
) {
  // Account settings apply in every workspace, so they need no active workspace.
  const account = new Hono<ScopeEnv<UserScope>>()
    .get("/preferences", scopes.user(), async (c) => respond(c, await service.account(c.var.scope)))
    .patch(
      "/preferences",
      v("json", updateAccountNotificationPreferences),
      scopes.user(),
      async (c) => respond(c, await service.updateAccount(c.var.scope, c.req.valid("json"))),
    );
  const workspace = new Hono<ScopeEnv>()
    .get(
      "/preferences/workspace",
      v("query", notificationWorkspace),
      scopes.workspace("query"),
      async (c) => respond(c, await service.workspace(c.var.scope)),
    )
    .patch(
      "/preferences/workspace",
      v("json", updateWorkspaceNotificationPreferences),
      scopes.workspace("json"),
      async (c) => respond(c, await service.updateWorkspace(c.var.scope, c.req.valid("json"))),
    )
    .get(
      "/preferences/conversations/:conversationId",
      v("param", conversationNotificationParams),
      v("query", notificationWorkspace),
      scopes.workspace("query"),
      async (c) =>
        respond(c, await service.conversation(c.var.scope, c.req.valid("param").conversationId)),
    )
    .patch(
      "/preferences/conversations/:conversationId",
      v("param", conversationNotificationParams),
      v("json", updateConversationNotificationPreferences),
      scopes.workspace("json"),
      async (c) =>
        respond(
          c,
          await service.updateConversation(
            c.var.scope,
            c.req.valid("param").conversationId,
            c.req.valid("json"),
          ),
        ),
    );
  return new Hono().route("/", account).route("/", workspace);
}
