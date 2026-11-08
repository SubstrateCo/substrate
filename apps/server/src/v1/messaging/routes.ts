import {
  workspaceInput,
  conversationInput,
  messageListInput,
  messageInput,
  reactionInput,
  membersInput,
  profileInput,
  conversationTargetInput,
  leaveInput,
  ownerInput,
  addAgentInput,
  removeAgentInput,
} from "@startup-os/contracts/messaging/input";

import { respond, validationHook } from "../../shared/http";
import * as defaultServices from "./service";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

export function createMessagingRoutes(services = defaultServices) {
  return new Hono()
    .get("/conversations", zValidator("query", workspaceInput, validationHook), async (c) =>
      respond(c, await services.listConversations(c.req.raw.headers, c.req.valid("query"))),
    )
    .post("/conversations", zValidator("json", conversationInput, validationHook), async (c) =>
      respond(c, await services.createConversation(c.req.raw.headers, c.req.valid("json"))),
    )
    .get("/profiles", zValidator("query", profileInput, validationHook), async (c) =>
      respond(c, await services.getProfile(c.req.raw.headers, c.req.valid("query"))),
    )
    .get("/messages", zValidator("query", messageListInput, validationHook), async (c) =>
      respond(c, await services.listMessages(c.req.raw.headers, c.req.valid("query"))),
    )
    .post("/messages", zValidator("json", messageInput, validationHook), async (c) =>
      respond(c, await services.sendMessage(c.req.raw.headers, c.req.valid("json"))),
    )
    .post("/reactions", zValidator("json", reactionInput, validationHook), async (c) =>
      respond(c, await services.toggleReaction(c.req.raw.headers, c.req.valid("json"))),
    )
    .post("/members", zValidator("json", membersInput, validationHook), async (c) =>
      respond(c, await services.addMembers(c.req.raw.headers, c.req.valid("json"))),
    )
    .post("/agents/add", zValidator("json", addAgentInput, validationHook), async (c) =>
      respond(c, await services.addAgent(c.req.raw.headers, c.req.valid("json"))),
    )
    .post("/agents/remove", zValidator("json", removeAgentInput, validationHook), async (c) =>
      respond(c, await services.removeAgent(c.req.raw.headers, c.req.valid("json"))),
    )
    .get("/conversations/managed", zValidator("query", workspaceInput, validationHook), async (c) =>
      respond(c, await services.listManagedConversations(c.req.raw.headers, c.req.valid("query"))),
    )
    .get(
      "/conversations/delete-impact",
      zValidator("query", conversationTargetInput, validationHook),
      async (c) => respond(c, await services.deleteImpact(c.req.raw.headers, c.req.valid("query"))),
    )
    .post(
      "/conversations/join",
      zValidator("json", conversationTargetInput, validationHook),
      async (c) =>
        respond(c, await services.joinConversation(c.req.raw.headers, c.req.valid("json"))),
    )
    .post("/conversations/leave", zValidator("json", leaveInput, validationHook), async (c) =>
      respond(c, await services.leaveConversation(c.req.raw.headers, c.req.valid("json"))),
    )
    .post("/conversations/owner", zValidator("json", ownerInput, validationHook), async (c) =>
      respond(c, await services.transferOwnership(c.req.raw.headers, c.req.valid("json"))),
    )
    .post(
      "/conversations/delete",
      zValidator("json", conversationTargetInput, validationHook),
      async (c) =>
        respond(c, await services.deleteConversation(c.req.raw.headers, c.req.valid("json"))),
    );
}
