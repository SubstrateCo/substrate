import type { AppSettings } from "@substrate/contracts/apps";
import { publicFailure, success } from "@substrate/contracts/result";

import { createApp } from "../../app";
import { appFixture } from "../../test-support";
import { expect, test } from "bun:test";

test("app settings routes retain the shared result envelope", async () => {
  const deps = appFixture();
  const settings: AppSettings = { organizationId: "org", enabledApps: ["messages", "agents"] };
  deps.services.organizations.apps = async () => success(settings);
  const app = createApp(deps);
  const response = await app.request("/api/v1/organizations/apps?organizationId=org");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(success(settings));
});

test("app updates reject missing core apps before calling the service", async () => {
  const deps = appFixture();
  deps.services.organizations.updateApps = async () => {
    throw new Error("must not reach service");
  };
  const response = await createApp(deps).request("/api/v1/organizations/apps", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
    body: JSON.stringify({ organizationId: "org", enabledApps: ["tasks"] }),
  });
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ success: false, error: { code: "INVALID_INPUT" } });
});

test("disabled apps map to HTTP 403 without record metadata", async () => {
  const deps = appFixture();
  deps.services.organizations.apps = async () =>
    publicFailure("APP_DISABLED", "This app is disabled for this organization.");
  const response = await createApp(deps).request("/api/v1/organizations/apps?organizationId=org");
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({
    success: false,
    error: {
      code: "APP_DISABLED",
      message: "This app is disabled for this organization.",
      userMessage: "This app is disabled for this organization.",
    },
  });
});
