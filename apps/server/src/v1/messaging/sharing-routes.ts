import { conversationTargetInput, workspaceInput } from "@startup-os/contracts/messaging/input";
import {
  sharingAcceptInput,
  sharingActionInput,
  sharingDisconnectInput,
  sharingInviteInput,
  sharingInvitationInput,
  sharingRemoveInput,
} from "@startup-os/contracts/messaging/sharing";

import { respond, validationHook } from "../../shared/http";
import * as service from "./sharing-service";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

export function createSharingRoutes() {
  return new Hono()
    .get("/invitation", zValidator("query", sharingInvitationInput, validationHook), async (c) =>
      respond(c, await service.getInvitation(c.req.raw.headers, c.req.valid("query"))),
    )
    .post("/accept", zValidator("json", sharingAcceptInput, validationHook), async (c) =>
      respond(c, await service.acceptInvitation(c.req.raw.headers, c.req.valid("json"))),
    )
    .post("/decline", zValidator("json", sharingInvitationInput, validationHook), async (c) =>
      respond(c, await service.declineInvitation(c.req.raw.headers, c.req.valid("json"))),
    )
    .post("/invite", zValidator("json", sharingInviteInput, validationHook), async (c) =>
      respond(c, await service.invite(c.req.raw.headers, c.req.valid("json"))),
    )
    .post("/revoke", zValidator("json", sharingActionInput, validationHook), async (c) =>
      respond(c, await service.revoke(c.req.raw.headers, c.req.valid("json"))),
    )
    .post("/resend", zValidator("json", sharingActionInput, validationHook), async (c) =>
      respond(c, await service.resend(c.req.raw.headers, c.req.valid("json"))),
    )
    .post("/disconnect", zValidator("json", sharingDisconnectInput, validationHook), async (c) =>
      respond(c, await service.disconnect(c.req.raw.headers, c.req.valid("json"))),
    )
    .post("/remove", zValidator("json", sharingRemoveInput, validationHook), async (c) =>
      respond(c, await service.remove(c.req.raw.headers, c.req.valid("json"))),
    )
    .get("/details", zValidator("query", conversationTargetInput, validationHook), async (c) =>
      respond(c, await service.list(c.req.raw.headers, c.req.valid("query"))),
    )
    .get("/conversations", zValidator("query", workspaceInput, validationHook), async (c) =>
      respond(c, await service.conversations(c.req.raw.headers, c.req.valid("query"))),
    )
    .get("/inbox", zValidator("query", workspaceInput, validationHook), async (c) =>
      respond(c, await service.inbox(c.req.raw.headers, c.req.valid("query"))),
    );
}
