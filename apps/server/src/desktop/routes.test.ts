import { describe, expect, test } from "bun:test";
import { createDesktopRoutes } from "./routes";

describe("desktop open landing", () => {
  const app = createDesktopRoutes();

  test("provides a visible desktop link and prevents token caching and referrer leaks", async () => {
    const path =
      "/api/auth/verify-email?token=secret&callbackURL=https%3A%2F%2Fdesktop.startup-os.local%2Forganizations";
    const response = await app.request(`/open?path=${encodeURIComponent(path)}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(response.headers.get("Content-Security-Policy")).toContain("default-src 'none'");
    const body = await response.text();
    expect(body).toContain("Open Startup OS</a>");
    expect(body).toContain('href="startupos:');
    expect(body).not.toContain("<script");
    expect(body).not.toContain('http-equiv="refresh"');
  });

  test.each([
    undefined,
    "https://evil.example",
    "//evil.example",
    "/api/auth/sign-out",
    "/api/v1/tasks",
    "/\\evil.example",
    "/%2f%2fevil.example",
  ])("rejects unsafe target %s", async (path) => {
    const response = await app.request(
      path === undefined ? "/open" : `/open?path=${encodeURIComponent(path)}`,
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(await response.text()).not.toContain('href="startupos:');
  });
});
