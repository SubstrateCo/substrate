import { saveAgentTriggersInput } from "@startup-os/contracts/agents";
import {
  saveAgentInput,
  deleteAgentInput,
  setAgentPictureInput,
} from "@startup-os/contracts/agents";

import { respond, validationHook } from "../../shared/http";
import {
  listAgents,
  saveAgent,
  deleteAgent,
  setAgentPicture,
  saveAgentTriggers,
  setAgentHomeDevice,
} from "./service";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

export function createAgentsRoutes(
  services = {
    listAgents,
    saveAgent,
    deleteAgent,
    setAgentPicture,
    saveAgentTriggers,
    setAgentHomeDevice,
  },
) {
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
    )
    .post(
      "/actors/triggers",
      zValidator("json", saveAgentTriggersInput, validationHook),
      async (c) =>
        respond(c, await services.saveAgentTriggers(c.req.raw.headers, c.req.valid("json"))),
    )
    .post("/actors/home", zValidator("json", deleteAgentInput, validationHook), async (c) =>
      respond(c, await services.setAgentHomeDevice(c.req.raw.headers, c.req.valid("json"))),
    );
}
