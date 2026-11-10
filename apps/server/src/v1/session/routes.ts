import { respond } from "../../shared/http";
import { defaultSessionService, type SessionService } from "./service";
import { Hono } from "hono";

export function createSessionRoutes(service: SessionService = defaultSessionService) {
  return new Hono().get("/", async (c) => respond(c, await service.read(c.req.raw.headers)));
}
