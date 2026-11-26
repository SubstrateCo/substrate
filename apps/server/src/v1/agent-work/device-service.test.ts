import { desktopInstallationHeader } from "@substrate/contracts/desktop/links";
import { AccessDeniedError } from "@substrate/database";

import { createTestScopes, createTestServices, scopeFixture } from "../../test-support";
import { createAgentWorkRoutes } from "./routes";
import { expect, mock, test } from "bun:test";

test("heartbeat marks a registered device seen in the device service", async () => {
  const scope = scopeFixture();
  const installationId = crypto.randomUUID();
  const touch = mock(async () => ({
    result: {
      id: "device-1",
      userId: "user-1",
      installationId,
      name: "Workstation",
      platform: "win32",
      lastSeenAt: new Date(),
      createdAt: new Date(),
    },
    hints: [],
  }));
  scope.owner = { ...scope.owner, devices: { ...scope.owner.devices, touch } };
  const scopes = createTestScopes({
    repositories: { forOwnerSession: async () => scope.owner },
  });
  const services = createTestServices();
  const app = createAgentWorkRoutes(
    services.agentWork,
    services.devices,
    services.host,
    services.work,
    scopes,
  );
  const response = await app.request("/device/heartbeat", {
    method: "POST",
    headers: { "content-type": "application/json", [desktopInstallationHeader]: installationId },
    body: JSON.stringify({ installationId }),
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ success: true, data: {} });
  expect(touch).toHaveBeenCalledTimes(1);
  expect(touch).toHaveBeenCalledWith(installationId);
});

test("heartbeat rejects missing or mismatched installation headers and unregistered devices", async () => {
  const scope = scopeFixture();
  const installationId = crypto.randomUUID();
  const touch = mock(async () => {
    throw new AccessDeniedError();
  });
  scope.owner = { ...scope.owner, devices: { ...scope.owner.devices, touch } };
  const scopes = createTestScopes({
    repositories: { forOwnerSession: async () => scope.owner },
  });
  const services = createTestServices();
  const app = createAgentWorkRoutes(
    services.agentWork,
    services.devices,
    services.host,
    services.work,
    scopes,
  );

  for (const header of [undefined, crypto.randomUUID(), installationId]) {
    const headers = new Headers({ "content-type": "application/json" });
    if (header) headers.set(desktopInstallationHeader, header);
    const response = await app.request("/device/heartbeat", {
      method: "POST",
      headers,
      body: JSON.stringify({ installationId }),
    });
    expect(response.status).toBe(header === installationId ? 404 : 403);
    expect(await response.json()).toMatchObject({
      success: false,
      error: {
        code: header === installationId ? "NOT_FOUND" : "FORBIDDEN",
      },
    });
  }
  expect(touch).toHaveBeenCalledTimes(1);
  expect(touch).toHaveBeenCalledWith(installationId);
});
