import {
  saveAgentInput,
  deleteAgentInput,
  setAgentPictureInput,
} from "@startup-os/contracts/agents";

import { respond, validationHook } from "../../shared/http";
import * as defaultServices from "./service";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

export function createAgentsRoutes(services = defaultServices) {
  return new Hono()
    .post("/list", async (c) => respond(c, await services.listAgents(c.req.raw.headers)))
    .post("/actors/save", zValidator("json", saveAgentInput, validationHook), async (c) =>
      respond(c, await services.saveAgent(c.req.raw.headers, c.req.valid("json"))),
    )
    .post("/actors/delete", zValidator("json", deleteAgentInput, validationHook), async (c) =>
      respond(c, await services.deleteAgent(c.req.raw.headers, c.req.valid("json"))),
    )
    .post("/actors/picture", zValidator("json", setAgentPictureInput, validationHook), async (c) =>
      respond(c, await services.setAgentPicture(c.req.raw.headers, c.req.valid("json"))),
    );
}
