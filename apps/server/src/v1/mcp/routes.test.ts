import { failure, publicFailure } from "@substrate/contracts/result";

import { createTestScopes } from "../../test-support";
import { createMcpRoutes } from "./routes";
import { expect, mock, test } from "bun:test";

test("MCP rejects missing or malformed TurnContext before service execution", async () => {
  const callAgentTool = mock(async () => failure("NOT_FOUND", "Access denied."));
  const app = createMcpRoutes({ callAgentTool }, createTestScopes());
  for (const turn of [undefined, {}, { turnId: "invalid" }]) {
    const response = await app.request("/call", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        organizationId: "org",
        agentId: crypto.randomUUID(),
        tool: "list_projects",
        input: {},
        turn,
      }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(publicFailure("INVALID_INPUT", "Invalid request input."));
  }
  expect(callAgentTool).not.toHaveBeenCalled();
});

test("MCP forwards the validated turn and resolved workspace, and preserves denial", async () => {
  const callAgentTool = mock(async () => failure("NOT_FOUND", "Access denied."));
  const app = createMcpRoutes({ callAgentTool }, createTestScopes());
  const input = {
    organizationId: "org",
    agentId: crypto.randomUUID(),
    tool: "list_projects",
    input: {},
    turn: {
      turnId: crypto.randomUUID(),
      attempt: 1,
      sessionKey: "owner",
      origin: null,
      kind: "interactive",
    },
  };
  const response = await app.request("/call", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  expect(response.status).toBe(404);
  expect(callAgentTool).toHaveBeenCalledWith(
    expect.objectContaining({ userId: "user-1", organizationId: "org" }),
    input,
  );
});
