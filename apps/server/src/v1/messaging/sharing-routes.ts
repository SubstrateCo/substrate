import { conversationTargetInput, workspaceInput } from "@substrate/contracts/messaging/input";
import {
  sharingAcceptInput,
  sharingActionInput,
  sharingDisconnectInput,
  sharingInviteInput,
  sharingInvitationInput,
  sharingRemoveInput,
} from "@substrate/contracts/messaging/sharing";

import { respond, v } from "../../shared/http";
import type { ScopeEnv, Scopes } from "../../shared/scope";
import type { UserScope } from "../../shared/scope-types";
import type { SharingService } from "./sharing-service";
import { Hono } from "hono";

export function createSharingRoutes(service: SharingService, scopes: Scopes) {
  const user = new Hono<ScopeEnv<UserScope>>()
    .get("/invitation", v("query", sharingInvitationInput), scopes.user(), async (c) =>
      respond(c, await service.getInvitation(c.var.scope, c.req.valid("query"))),
    )
    .post("/accept", v("json", sharingAcceptInput), scopes.user(), async (c) =>
      respond(c, await service.acceptInvitation(c.var.scope, c.req.valid("json"))),
    )
    .post("/decline", v("json", sharingInvitationInput), scopes.user(), async (c) =>
      respond(c, await service.declineInvitation(c.var.scope, c.req.valid("json"))),
    );
  const workspace = new Hono<ScopeEnv>()
    .post("/invite", v("json", sharingInviteInput), scopes.workspace("json"), async (c) =>
      respond(c, await service.invite(c.var.scope, c.req.valid("json"))),
    )
    .post("/revoke", v("json", sharingActionInput), scopes.workspace("json"), async (c) =>
      respond(c, await service.revoke(c.var.scope, c.req.valid("json"))),
    )
    .post("/resend", v("json", sharingActionInput), scopes.workspace("json"), async (c) =>
      respond(c, await service.resend(c.var.scope, c.req.valid("json"))),
    )
    .post("/disconnect", v("json", sharingDisconnectInput), scopes.workspace("json"), async (c) =>
      respond(c, await service.disconnect(c.var.scope, c.req.valid("json"))),
    )
    .post("/remove", v("json", sharingRemoveInput), scopes.workspace("json"), async (c) =>
      respond(c, await service.remove(c.var.scope, c.req.valid("json"))),
    )
    .get("/details", v("query", conversationTargetInput), scopes.workspace("query"), async (c) =>
      respond(c, await service.list(c.var.scope, c.req.valid("query"))),
    )
    .get("/conversations", v("query", workspaceInput), scopes.workspace("query"), async (c) =>
      respond(c, await service.conversations(c.var.scope, c.req.valid("query"))),
    )
    .get("/inbox", v("query", workspaceInput), scopes.workspace("query"), async (c) =>
      respond(c, await service.inbox(c.var.scope, c.req.valid("query"))),
    );
  return new Hono().route("/", user).route("/", workspace);
}
