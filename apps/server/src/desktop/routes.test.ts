import { createDesktopRoutes } from "./routes";
import { describe, expect, test } from "bun:test";

describe("desktop open landing", () => {
  const app = createDesktopRoutes();

  test("provides a desktop invitation link and prevents caching and referrer leaks", async () => {
    const path = "/accept-invitation/invite-1";
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
    "/api/auth/verify-email?token=secret",
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

describe("desktop releases", () => {
  test("reports installer availability and redirects only to the configured installer", async () => {
    const app = createDesktopRoutes({
      frontendURL: "https://app.example.test",
      windowsURL: "https://downloads.example.test/StartupOS.exe",
    });
    const release = await app.request("/release");
    expect(await release.json()).toEqual({ success: true, data: { windowsAvailable: true } });
    const download = await app.request("/download?redirect=https://evil.example");
    expect(download.status).toBe(303);
    expect(download.headers.get("location")).toBe("https://downloads.example.test/StartupOS.exe");
    expect(download.headers.get("Cache-Control")).toBe("no-store");
    expect(download.headers.get("Referrer-Policy")).toBe("no-referrer");
  });

  test("does not advertise or redirect to an unpublished installer", async () => {
    const app = createDesktopRoutes({
      frontendURL: "https://app.example.test",
      windowsURL: undefined,
    });
    expect(await (await app.request("/release")).json()).toEqual({
      success: true,
      data: { windowsAvailable: false },
    });
    const response = await app.request("/download");
    expect(response.status).toBe(404);
    expect(response.headers.get("location")).toBeNull();
    expect(await response.json()).toMatchObject({ success: false, error: { code: "NOT_FOUND" } });
  });
});
