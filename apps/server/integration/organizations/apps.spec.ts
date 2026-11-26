import { appOrigin } from "../test-support/environment";
import { test } from "../test-support/fixtures";
import { provisionWorkspaceSession } from "../test-support/organizations";
import { expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

for (const prefix of ["/api/v1", "/api/mobile"]) {
  test(`${prefix} app settings are member-readable, admin-writable, and organization scoped`, async ({
    actors: { owner, member, outsider },
    request,
  }) => {
    const params = { organizationId: owner.organizationId };
    const path = `${prefix}/organizations/apps`;
    const before = await owner.request.get(path, { params });
    const settings = (await before.json()).data;
    try {
      const denied = await member.request.patch(path, {
        headers: { origin: appOrigin },
        data: { ...params, enabledApps: ["messages", "agents"] },
      });
      expect(denied.ok()).toBe(false);
      const updated = await owner.request.patch(path, {
        headers: { origin: appOrigin },
        data: { ...params, enabledApps: ["messages", "agents", "crm"] },
      });
      expect(updated.status()).toBe(200);
      expect((await updated.json()).data).toEqual({
        ...params,
        enabledApps: ["messages", "agents", "crm"],
      });
      const read = await member.request.get(path, { params });
      expect(read.status()).toBe(200);
      expect((await read.json()).data.enabledApps).toEqual(["messages", "agents", "crm"]);
      const alias = prefix === "/api/v1" ? "/api/mobile" : "/api/v1";
      const shared = await owner.request.get(`${alias}/organizations/apps`, { params });
      expect(shared.status()).toBe(200);
      expect((await shared.json()).data).toEqual({
        ...params,
        enabledApps: ["messages", "agents", "crm"],
      });
      expect((await outsider.request.get(path, { params })).status()).toBe(403);
      expect((await request.get(path, { params })).status()).toBe(401);
      const invalid = await owner.request.patch(path, {
        headers: { origin: appOrigin },
        data: { ...params, enabledApps: ["tasks"] },
      });
      expect(invalid.status()).toBe(400);
      const badOrigin = await owner.request.patch(path, {
        headers: { origin: "https://untrusted.example" },
        data: settings,
      });
      expect(badOrigin.status()).toBe(403);
    } finally {
      const restored = await owner.request.patch(path, {
        headers: { origin: appOrigin },
        data: settings,
      });
      expect(restored.ok()).toBe(true);
    }
  });
}

test("new organizations start with optional apps disabled", async ({ actors: { outsider } }) => {
  const previous = outsider.organizationId;
  const suffix = randomUUID();
  try {
    const organization = await provisionWorkspaceSession(
      outsider.request,
      `Default apps ${suffix}`,
      `default-apps-${suffix}`,
      { enableOptionalApps: false },
    );
    const response = await outsider.request.get("/api/v1/organizations/apps", {
      params: { organizationId: organization.id },
    });
    expect(response.status()).toBe(200);
    expect((await response.json()).data).toEqual({
      organizationId: organization.id,
      enabledApps: ["messages", "agents"],
    });
  } finally {
    const activated = await outsider.request.post("/api/auth/organization/set-active", {
      headers: { origin: appOrigin },
      data: { organizationId: previous },
    });
    expect(activated.ok()).toBe(true);
  }
});
