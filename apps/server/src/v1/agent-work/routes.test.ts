import { failure, publicFailure } from "@substrate/contracts/result";

import { createTestScopes, createTestServices } from "../../test-support";
import { createAgentWorkRoutes } from "./routes";
import { expect, mock, test } from "bun:test";

test("agent-work validates all owner and device inputs before calling services", async () => {
  const services = createTestServices();
  const work = {
    listConversationRequests: mock(services.agentWork.listConversationRequests),
    listNeedsYou: mock(services.agentWork.listNeedsYou),
    listStatus: mock(services.agentWork.listStatus),
    respondToRequest: mock(services.agentWork.respondToRequest),
    approveProposal: mock(services.agentWork.approveProposal),
    declineProposal: mock(services.agentWork.declineProposal),
  };
  const device = {
    registerDevice: mock(services.devices.registerDevice),
    deviceHeartbeat: mock(services.devices.deviceHeartbeat),
    pullWakes: mock(services.devices.pullWakes),
    ackWakes: mock(services.devices.ackWakes),
    loadSources: mock(services.devices.loadSources),
    publishStatus: mock(services.devices.publishStatus),
    openRequest: mock(services.devices.openRequest),
    closeRequest: mock(services.devices.closeRequest),
    requestAnswers: mock(services.devices.requestAnswers),
  };
  const app = createAgentWorkRoutes(work, device, createTestScopes());
  for (const [method, path] of [
    ["GET", "/requests"],
    ["GET", "/needs-you"],
    ["GET", "/status"],
    ["POST", "/requests/invalid/respond"],
    ["POST", "/requests/invalid/approve"],
    ["POST", "/requests/invalid/decline"],
    ["POST", "/device/register"],
    ["POST", "/device/heartbeat"],
    ["POST", "/device/wakes/pull"],
    ["POST", "/device/wakes/ack"],
    ["POST", "/device/sources"],
    ["POST", "/device/status"],
    ["POST", "/device/requests"],
    ["POST", "/device/requests/close"],
    ["POST", "/device/requests/answers"],
  ] as const) {
    const response = await app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      body: method === "POST" ? "{}" : undefined,
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(publicFailure("INVALID_INPUT", "Invalid request input."));
  }
  for (const spy of [...Object.values(work), ...Object.values(device)])
    expect(spy).not.toHaveBeenCalled();
});

test("owner decisions preserve request IDs, scope and domain denials", async () => {
  const services = createTestServices();
  const approveProposal = mock(async () => failure("CONFLICT", "Request already answered."));
  const app = createAgentWorkRoutes(
    { ...services.agentWork, approveProposal },
    services.devices,
    createTestScopes(),
  );
  const id = crypto.randomUUID();
  const response = await app.request(`/requests/${id}/approve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ organizationId: "org" }),
  });
  expect(response.status).toBe(409);
  expect(approveProposal).toHaveBeenCalledWith(
    expect.objectContaining({ userId: "user-1", organizationId: "org" }),
    id,
    { organizationId: "org" },
  );
});
