import { Hono } from "hono";
import { respond } from "../../shared/http";
import { defaultOrganizationService, type OrganizationService } from "./service";

export function createOrganizationRoutes(
  service: OrganizationService = defaultOrganizationService,
) {
  return new Hono().get("/settings-access", async (c) => {
    c.header("Cache-Control", "no-store");
    return respond(c, await service.settingsAccess(c.req.raw.headers));
  });
}
