import {
  workspaceInput,
  conversationInput,
  messageListInput,
  messageInput,
  reactionInput,
  membersInput,
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
    );
}
