import type { hostFinishInput } from "@substrate/contracts/agent-work/control";
import { desktopInstallationHeader } from "@substrate/contracts/desktop/links";
import { ConflictError } from "@substrate/database";

import { createTestScopes, createTestServices } from "../../test-support";
import { createAgentWorkRoutes } from "./routes";
import { expect, mock, test } from "bun:test";
import type { z } from "zod";

const installationId = crypto.randomUUID();
const turnId = crypto.randomUUID();

function app(finish: (...args: unknown[]) => Promise<never>) {
  const scopes = createTestScopes({
    repositories: {
      // SAFETY: the route under test reaches only host.finish.
      forDeviceSession: async () => ({ host: { finish } }) as never,
    },
  });
  const services = createTestServices();
  return createAgentWorkRoutes(
    services.agentWork,
    services.devices,
    services.host,
    services.work,
    scopes,
  );
}

const finish = (body: Partial<z.input<typeof hostFinishInput>> | { status: "running" }) => ({
  method: "POST",
  headers: { "content-type": "application/json", [desktopInstallationHeader]: installationId },
  body: JSON.stringify({ organizationId: "org", installationId, attempt: 1, ...body }),
});

test("a finish for a turn this device no longer runs is a conflict, and the body names no device", async () => {
  const report = mock(async () => {
    throw new ConflictError("This device no longer runs this turn.");
  });
  const response = await app(report).request(
    `/host/turns/${turnId}/finish`,
    finish({ status: "completed" }),
  );
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ success: false, error: { code: "CONFLICT" } });
  expect(report).toHaveBeenCalledTimes(1);
  expect(report).toHaveBeenCalledWith(turnId, {
    attempt: 1,
    status: "completed",
    outcome: null,
    error: null,
    attentionReason: null,
    interruption: null,
    consumedItemIds: [],
    stillQueuedItemIds: [],
    usage: null,
  });
});

test("a finish with a status a host cannot report is rejected before the repository", async () => {
  const report = mock(async () => {
    throw new Error("unreachable");
  });
  const response = await app(report).request(
    `/host/turns/${turnId}/finish`,
    finish({ status: "running" }),
  );
  expect(response.status).toBe(400);
  expect(report).not.toHaveBeenCalled();
});
