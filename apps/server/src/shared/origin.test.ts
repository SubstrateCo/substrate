import { trustedOrigin } from "./origin";
import { expect, test } from "bun:test";
import { Hono } from "hono";

test("all v1 mutations require an explicit trusted origin", async () => {
  const app = new Hono()
    .use("/api/v1/*", trustedOrigin(["https://desktop.test"]))
    .all("/api/v1/example", (c) => c.text("ok"));
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    expect((await app.request("/api/v1/example", { method })).status).toBe(403);
    expect(
      (await app.request("/api/v1/example", { method, headers: { origin: "https://evil.test" } }))
        .status,
    ).toBe(403);
    expect(
      (
        await app.request("/api/v1/example", {
          method,
          headers: { origin: "https://desktop.test" },
        })
      ).status,
    ).toBe(200);
  }
  for (const method of ["GET", "HEAD", "OPTIONS"]) {
    expect((await app.request("/api/v1/example", { method })).status).toBe(200);
  }
});
