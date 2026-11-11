import {
  workspaceInput,
  conversationInput,
  messageListInput,
  messageInput,
  reactionInput,
  reactionListInput,
  membersInput,
  profileInput,
  conversationTargetInput,
  leaveInput,
  ownerInput,
  addAgentInput,
  removeAgentInput,
} from "@substrate/contracts/messaging/input";

import { respond, v } from "../../shared/http";
import type { ScopeEnv, Scopes } from "../../shared/scope";
import type { MessagingService } from "./service";
import { Hono } from "hono";

export function createMessagingRoutes(services: MessagingService, scopes: Scopes) {
  return new Hono<ScopeEnv>()
    .get("/conversations", v("query", workspaceInput), scopes.workspace("query"), async (c) =>
      respond(c, await services.listConversations(c.var.scope, c.req.valid("query"))),
    )
    .post("/conversations", v("json", conversationInput), scopes.workspace("json"), async (c) =>
      respond(c, await services.createConversation(c.var.scope, c.req.valid("json"))),
    )
    .get("/profiles", v("query", profileInput), scopes.workspace("query"), async (c) =>
      respond(c, await services.getProfile(c.var.scope, c.req.valid("query"))),
    )
    .get("/messages", v("query", messageListInput), scopes.workspace("query"), async (c) =>
      respond(c, await services.listMessages(c.var.scope, c.req.valid("query"))),
    )
    .post("/messages", v("json", messageInput), scopes.workspace("json"), async (c) =>
      respond(c, await services.sendMessage(c.var.scope, c.req.valid("json"))),
    )
    .get("/reactions", v("query", reactionListInput), scopes.workspace("query"), async (c) =>
      respond(c, await services.listReactions(c.var.scope, c.req.valid("query"))),
    )
    .post("/reactions", v("json", reactionInput), scopes.workspace("json"), async (c) =>
      respond(c, await services.toggleReaction(c.var.scope, c.req.valid("json"))),
    )
    .post("/members", v("json", membersInput), scopes.workspace("json"), async (c) =>
      respond(c, await services.addMembers(c.var.scope, c.req.valid("json"))),
    )
    .post("/agents/add", v("json", addAgentInput), scopes.workspace("json"), async (c) =>
      respond(c, await services.addAgent(c.var.scope, c.req.valid("json"))),
    )
    .post("/agents/remove", v("json", removeAgentInput), scopes.workspace("json"), async (c) =>
      respond(c, await services.removeAgent(c.var.scope, c.req.valid("json"))),
    )
    .get(
      "/conversations/managed",
      v("query", workspaceInput),
      scopes.workspace("query"),
      async (c) =>
        respond(c, await services.listManagedConversations(c.var.scope, c.req.valid("query"))),
    )
    .get(
      "/conversations/delete-impact",
      v("query", conversationTargetInput),
      scopes.workspace("query"),
      async (c) => respond(c, await services.deleteImpact(c.var.scope, c.req.valid("query"))),
    )
    .post(
      "/conversations/join",
      v("json", conversationTargetInput),
      scopes.workspace("json"),
      async (c) => respond(c, await services.joinConversation(c.var.scope, c.req.valid("json"))),
    )
    .post("/conversations/leave", v("json", leaveInput), scopes.workspace("json"), async (c) =>
      respond(c, await services.leaveConversation(c.var.scope, c.req.valid("json"))),
    )
    .post("/conversations/owner", v("json", ownerInput), scopes.workspace("json"), async (c) =>
      respond(c, await services.transferOwnership(c.var.scope, c.req.valid("json"))),
    )
    .post(
      "/conversations/delete",
      v("json", conversationTargetInput),
      scopes.workspace("json"),
      async (c) => respond(c, await services.deleteConversation(c.var.scope, c.req.valid("json"))),
    );
}
