import { publicFailure } from "@substrate/contracts/result";

import { createTestScopes, createTestServices } from "../../test-support";
import { createCallerRoutes } from "./callers-routes";
import { expect, mock, test } from "bun:test";

test("caller settings validate their input before calling the service", async () => {
  const services = createTestServices();
  const callers = {
    savePolicy: mock(services.callers.savePolicy),
    listCallers: mock(services.callers.listCallers),
    allowCaller: mock(services.callers.allowCaller),
    removeCaller: mock(services.callers.removeCaller),
  };
  const app = createCallerRoutes(callers, createTestScopes());
  const agentId = crypto.randomUUID();
  for (const [path, body] of [
    ["/actors/callers/policy", { organizationId: "org", agentId, policy: "everyone" }],
    ["/actors/callers/list", { organizationId: "org" }],
    ["/actors/callers/allow", { organizationId: "org", agentId, callerActorId: "bob" }],
    ["/actors/callers/remove", { organizationId: "org", agentId }],
  ] as const) {
    const response = await app.request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(publicFailure("INVALID_INPUT", "Invalid request input."));
  }
  for (const spy of Object.values(callers)) expect(spy).not.toHaveBeenCalled();
});
