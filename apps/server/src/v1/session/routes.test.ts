import { success } from "@startup-os/contracts/result";

import { createSessionRoutes } from "./routes";
import { describe, expect, test } from "bun:test";
import { Hono } from "hono";

describe("session routes", () => {
  test("serves the public session mount without caching and forwards request headers", async () => {
    const cookies: (string | null)[] = [];
    const app = new Hono().route(
      "/api/v1/session",
      createSessionRoutes({
        read: async (headers) => {
          cookies.push(headers.get("cookie"));
          return success(null);
        },
      }),
    );
    const response = await app.request("/api/v1/session", { headers: { cookie: "session=test" } });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ success: true, data: null });
    expect(cookies).toEqual(["session=test"]);
  });
});
