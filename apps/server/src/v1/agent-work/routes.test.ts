import { failure, publicFailure } from "@substrate/contracts/result";

import {
  createTestScopes,
  createTestServices,
  createUnreachableServices,
} from "../../test-support";
import { createAgentWorkRoutes } from "./routes";
import { expect, mock, test } from "bun:test";

test("agent-work validates all owner and device inputs before calling services", async () => {
  const app = createAgentWorkRoutes(
    createUnreachableServices(),
    createUnreachableServices(),
    createTestScopes(),
  );
  for (const [method, path] of [
    ["GET", "/requests"],
    ["GET", "/needs-you"],
    ["GET", "/status"],
    ["POST", "/requests/invalid/respond"],
    ["POST", "/requests/invalid/approve"],
    ["POST", "/requests/invalid/decline"],
    ["GET", "/invocations"],
    ["POST", "/invocations/invalid/decide"],
    ["GET", "/calls"],
    ["GET", "/calls/mine"],
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
