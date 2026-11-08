import { success } from "@startup-os/contracts/result";

import { createOrganizationRoutes } from "./routes";
import { describe, expect, test } from "bun:test";
import { Hono } from "hono";

describe("organization routes", () => {
  test("serves settings access at the public mount without caching", async () => {
    const cookies: (string | null)[] = [];
    const access = { organizationId: "organization-1", isOwner: true };
    const app = new Hono().route(
      "/api/v1/organizations",
      createOrganizationRoutes({
        settingsAccess: async (headers) => {
          cookies.push(headers.get("cookie"));
          return success(access);
        },
      }),
    );
    const response = await app.request("/api/v1/organizations/settings-access", {
      headers: { cookie: "session=test" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ success: true, data: access });
    expect(cookies).toEqual(["session=test"]);
  });

  test("preserves null access", async () => {
    const unavailable = createOrganizationRoutes({ settingsAccess: async () => success(null) });
    const response = await unavailable.request("/settings-access");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: null });
  });
});
