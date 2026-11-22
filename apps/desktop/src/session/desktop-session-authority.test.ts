import { DesktopSessionAuthority } from "./desktop-session-authority.ts";
import { afterEach, expect, jest, test } from "bun:test";
import { rejects } from "node:assert/strict";

afterEach(() => jest.useRealTimers());

test("local authority rechecks after sixty seconds even without a realtime hint", async () => {
  jest.useFakeTimers();
  let checks = 0;
  const authority = new DesktopSessionAuthority({
    backend: "https://api.example.com",
    fetchAPI: async (url) => {
      if (new URL(url).pathname === "/api/auth/get-session") {
        checks++;
        return Response.json({
          user: { id: "user", emailVerified: true },
          session: { activeOrganizationId: "org" },
        });
      }
      return Response.json({ role: "owner" });
    },
  });
  await authority.verify();
  jest.advanceTimersByTime(59_999);
  await authority.verify();
  expect(checks).toBe(1);
  jest.advanceTimersByTime(1);
  await authority.verify();
  expect(checks).toBe(2);
});

test("invalidation rejects an old verification and drops the catalog cache", async () => {
  const gate = Promise.withResolvers<void>();
  let delayed = true;
  let catalogCalls = 0;
  const cookieCache: (string | null)[] = [];
  const authority = new DesktopSessionAuthority({
    backend: "https://api.example.com",
    fetchAPI: async (url) => {
      if (new URL(url).pathname === "/api/auth/get-session") {
        cookieCache.push(new URL(url).searchParams.get("disableCookieCache"));
        if (delayed) await gate.promise;
        return Response.json({
          user: { id: "user", emailVerified: true },
          session: { activeOrganizationId: "org" },
        });
      }
      if (url.includes("get-active-member-role")) return Response.json({ role: "owner" });
      catalogCalls++;
      return Response.json({ success: true, data: { agents: [], runSettings: [] } });
    },
  });
  let changes = 0;
  authority.onChange(() => {
    changes++;
  });
  const old = authority.verify();
  authority.invalidate();
  delayed = false;
  gate.resolve();
  await rejects(old, /Session changed\./);
  expect((await authority.verify()).organizationId).toBe("org");
  // The first read may use the cookie cache. Reads after an invalidation must bypass it.
  expect(cookieCache[0]).toBeNull();
  expect(cookieCache.length).toBeGreaterThan(1);
  expect(cookieCache.slice(1).every((value) => value === "true")).toBe(true);
  await authority.catalog();
  await authority.catalog();
  expect(catalogCalls).toBe(1);
  authority.invalidate();
  await authority.catalog();
  expect(catalogCalls).toBe(2);
  expect(changes).toBe(2);
});

test("app settings come from the server and refresh after a workspace hint", async () => {
  let enabledApps = ["messages", "agents", "tasks"];
  const authority = new DesktopSessionAuthority({
    backend: "https://api.example.com",
    fetchAPI: async (url) => {
      if (new URL(url).pathname === "/api/auth/get-session")
        return Response.json({
          user: { id: "user", emailVerified: true },
          session: { activeOrganizationId: "org" },
        });
      if (url.includes("get-active-member-role")) return Response.json({ role: "member" });
      expect(new URL(url).searchParams.get("organizationId")).toBe("org");
      return Response.json({ success: true, data: { organizationId: "org", enabledApps } });
    },
  });
  expect((await authority.appSettings()).enabledApps).toContain("tasks");
  enabledApps = ["messages", "agents"];
  authority.invalidate();
  expect((await authority.appSettings()).enabledApps).not.toContain("tasks");
});
