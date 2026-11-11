import { desktopInstallationHeader } from "@substrate/contracts/desktop/links";
import { success } from "@substrate/contracts/result";
import { AccessDeniedError } from "@substrate/database";

import { createTestScopes, scopeFixture } from "../test-support";
import { sessionFixture } from "../v1/session/test-support";
import { respond, v } from "./http";
import type { ScopeDependencies, ScopeEnv, UserScope, SettingsScope } from "./scope";
import { expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { z } from "zod";

for (const [session, code] of [
  [null, "UNAUTHENTICATED"],
  [sessionFixture({ emailVerified: false }), "FORBIDDEN"],
  [sessionFixture({ organizationId: "other" }), "WORKSPACE_CHANGED"],
  [sessionFixture({ organizationId: null }), "WORKSPACE_CHANGED"],
] as const) {
  test(`workspace rejects ${code} before workspace repositories or service access`, async () => {
    const forSession = mock(async () => scopeFixture().repositories);
    const forOwnerSession = mock(async () => scopeFixture().owner);
    const service = mock(() => success(null));
    const scopes = createTestScopes({
      api: {
        getSession: async () => session,
        getActiveMemberRole: async () => ({ role: "owner" }),
      },
      repositories: { forSession, forOwnerSession },
    });
    const app = new Hono<ScopeEnv>().get(
      "/",
      v("query", z.object({ organizationId: z.string() })),
      scopes.workspace("query"),
      (c) => respond(c, service()),
    );
    const response = await app.request("/?organizationId=org");
    expect(await response.json()).toMatchObject({ success: false, error: { code } });
    expect(forSession).not.toHaveBeenCalled();
    expect(service).not.toHaveBeenCalled();
  });
}

test("removed membership fails before the workspace service", async () => {
  const scopes = createTestScopes({
    repositories: {
      forOwnerSession: async () => scopeFixture().owner,
      forSession: async () => {
        throw new AccessDeniedError();
      },
    },
  });
  const service = mock(() => success(null));
  const app = new Hono<ScopeEnv>().get("/", scopes.workspace(), (c) => respond(c, service()));
  const response = await app.request("/");
  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({ success: false, error: { code: "NOT_FOUND" } });
  expect(service).not.toHaveBeenCalled();
});

test("owner scope works without an active workspace and parses only the installation header", async () => {
  const session = sessionFixture({ organizationId: null });
  const installationId = crypto.randomUUID();
  const forOwnerSession = mock(async () => scopeFixture().owner);
  const scopes = createTestScopes({
    api: { getSession: async () => session, getActiveMemberRole: async () => ({ role: "owner" }) },
    repositories: {
      forOwnerSession,
      forSession: async () => {
        throw new Error("No workspace");
      },
    },
  });
  const app = new Hono<ScopeEnv<UserScope>>().get("/", scopes.user(), (c) =>
    c.json({ userId: c.var.scope.userId }),
  );
  const response = await app.request("/", {
    headers: { [desktopInstallationHeader]: installationId },
  });
  expect(await response.json()).toEqual({ userId: session.user.id });
  expect(forOwnerSession).toHaveBeenCalledWith({ userId: session.user.id, installationId });
});

test("device scope binds the validated installation to a registered device of the session user", async () => {
  const installationId = crypto.randomUUID();
  const checkDevice = mock(async () => {
    throw new AccessDeniedError();
  });
  const scopes = createTestScopes({ checkDevice });
  const service = mock(() => success(null));
  const app = new Hono().post(
    "/",
    v("json", z.object({ organizationId: z.string(), installationId: z.uuid() })),
    scopes.device("json"),
    (c) => respond(c, service()),
  );
  for (const header of [undefined, crypto.randomUUID(), installationId]) {
    const headers = new Headers({ "content-type": "application/json" });
    if (header) headers.set(desktopInstallationHeader, header);
    const response = await app.request("/", {
      method: "POST",
      headers,
      body: JSON.stringify({ organizationId: "org", installationId }),
    });
    expect(response.status).toBe(header === installationId ? 404 : 403);
  }
  expect(checkDevice).toHaveBeenCalledTimes(1);
  expect(checkDevice).toHaveBeenCalledWith("user-1", installationId);
  expect(service).not.toHaveBeenCalled();
});

test("settings membership is checked only for verified sessions with an active workspace", async () => {
  for (const session of [
    null,
    sessionFixture({ emailVerified: false }),
    sessionFixture({ organizationId: null }),
    sessionFixture(),
  ]) {
    const getActiveMemberRole = mock(async () => ({ role: "owner" }));
    const api: ScopeDependencies["api"] = { getSession: async () => session, getActiveMemberRole };
    const scopes = createTestScopes({ api });
    const app = new Hono<ScopeEnv<SettingsScope>>().get("/", scopes.settings(), (c) =>
      c.json({ role: c.var.scope.role }),
    );
    const response = await app.request("/");
    const expected = !!session?.user.emailVerified && !!session.session.activeOrganizationId;
    expect(await response.json()).toEqual({ role: expected ? "owner" : null });
    expect(getActiveMemberRole).toHaveBeenCalledTimes(expected ? 1 : 0);
  }
});
