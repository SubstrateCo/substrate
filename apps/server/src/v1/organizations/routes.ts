import { respond } from "../../shared/http";
import { defaultOrganizationService, type OrganizationService } from "./service";
import { Hono } from "hono";

export function createOrganizationRoutes(
  service: OrganizationService = defaultOrganizationService,
) {
  return new Hono().get("/settings-access", async (c) =>
    respond(c, await service.settingsAccess(c.req.raw.headers)),
  );
}
