import { desktopInstallationHeader } from "@substrate/contracts/desktop/links";

import { createTestScopes, createTestServices, scopeFixture } from "../../test-support";
import { createAgentWorkRoutes } from "./routes";
import { expect, mock, test } from "bun:test";

test("heartbeat marks a registered device seen once, not again in its service", async () => {
  const scope = scopeFixture();
  const touch = mock(async () => {
    throw new Error("Duplicate device touch");
  });
  scope.owner = { ...scope.owner, devices: { ...scope.owner.devices, touch } };
  const checkDevice = mock(async () => {});
  const scopes = createTestScopes({
    repositories: { forOwnerSession: async () => scope.owner },
    checkDevice,
  });
  const services = createTestServices();
  const app = createAgentWorkRoutes(services.agentWork, services.devices, scopes);
  const installationId = crypto.randomUUID();
  const response = await app.request("/device/heartbeat", {
    method: "POST",
    headers: { "content-type": "application/json", [desktopInstallationHeader]: installationId },
    body: JSON.stringify({ installationId }),
  });
  expect(await response.json()).toEqual({ success: true, data: {} });
  expect(checkDevice).toHaveBeenCalledTimes(1);
  expect(checkDevice).toHaveBeenCalledWith("user-1", installationId);
  expect(touch).not.toHaveBeenCalled();
});
