import { ConflictError } from "@substrate/database";

import type { WorkspaceScope } from "../../shared/scope-types";
import { createTestScopes, createTestServices, scopeFixture } from "../../test-support";
import { createAgentWorkRoutes } from "./routes";
import { expect, mock, test } from "bun:test";

type AgentWork = WorkspaceScope["repositories"]["agentWork"];
type Body = Record<string, string | number | boolean | null | Record<string, boolean>>;

const id = crypto.randomUUID();
const committed = <T>(result: T) => ({ result, hints: [] });

function app(agentWork: Partial<AgentWork>) {
  const scope = scopeFixture();
  // SAFETY: each test reaches only the agent-work methods it provides.
  scope.repositories = { agentWork } as never;
  const scopes = createTestScopes({ repositories: { forSession: async () => scope.repositories } });
  const services = createTestServices();
  return createAgentWorkRoutes(
    services.agentWork,
    services.devices,
    services.host,
    services.work,
    scopes,
  );
}

const post = (body: Body = { organizationId: "org" }) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

test("each turn and item command reaches its own repository command with the path ID", async () => {
  const calls: string[][] = [];
  const command = (name: string) => async (target: string) => {
    calls.push([name, target]);
    return committed({ name });
  };
  const routes = {
    "/turns/:id/stop": "stopTurn",
    "/turns/:id/retry": "retryTurn",
    "/turns/:id/dismiss": "dismissTurn",
    "/turns/:id/start-fresh": "startFresh",
    "/items/:id/send-now": "sendNow",
    "/items/:id/resend": "resendItem",
    "/items/:id/discard": "discardItem",
    "/conversations/:id/new-topic": "newTopic",
  } as const;
  // SAFETY: the routes pass each command's result through unchanged.
  const repository = Object.fromEntries(
    Object.values(routes).map((name) => [name, command(name)]),
  ) as Partial<AgentWork>;
  const routed = app(repository);
  for (const [path, name] of Object.entries(routes)) {
    const response = await routed.request(path.replace(":id", id), post());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: { name } });
  }
  expect(calls).toEqual(Object.values(routes).map((name) => [name, id]));
});

test("a command that lost a race is a conflict", async () => {
  const retryTurn = mock(async () => {
    throw new ConflictError("The agent is busy. Try again when it finishes.");
  });
  const response = await app({ retryTurn }).request(`/turns/${id}/retry`, post());
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ success: false, error: { code: "CONFLICT" } });
});

test("routines are created, changed, approved and deleted for the caller's workspace", async () => {
  // SAFETY: the routes pass each routine result through unchanged.
  const routine = committed({ id }) as never;
  const createRoutine = mock(async () => routine);
  const updateRoutine = mock(async () => routine);
  const approveRoutine = mock(async () => routine);
  const deleteRoutine = mock(async () => committed(null));
  const routed = app({ createRoutine, updateRoutine, approveRoutine, deleteRoutine });
  const fields = {
    name: "Digest",
    prompt: "Summarize.",
    cron: "0 9 * * *",
    timezone: "UTC",
    enabled: true,
    destination: null,
  };
  const agentId = crypto.randomUUID();
  expect(
    (await routed.request("/routines", post({ organizationId: "org", agentId, ...fields }))).status,
  ).toBe(200);
  expect(createRoutine).toHaveBeenCalledWith(agentId, fields);
  const patch = await routed.request(`/routines/${id}`, {
    ...post({ organizationId: "org", changes: { enabled: false } }),
    method: "PATCH",
  });
  expect(patch.status).toBe(200);
  expect(updateRoutine).toHaveBeenCalledWith(id, { enabled: false });
  expect(
    (await routed.request(`/routines/${id}/approve`, post({ organizationId: "org", revision: 0 })))
      .status,
  ).toBe(400);
  await routed.request(`/routines/${id}/approve`, post({ organizationId: "org", revision: 2 }));
  expect(approveRoutine).toHaveBeenCalledWith(id, 2);
  const removed = await routed.request(`/routines/${id}?organizationId=org`, { method: "DELETE" });
  expect(removed.status).toBe(200);
  expect(deleteRoutine).toHaveBeenCalledWith(id);
});

test("activity passes its page cursor", async () => {
  // SAFETY: the route passes the page through unchanged.
  const agentActivity = mock(async () => ({ turns: [] }) as never);
  const response = await app({ agentActivity }).request(
    `/agents/${id}/activity?organizationId=org&cursor=1700000000000:${id}`,
  );
  expect(response.status).toBe(200);
  expect(agentActivity).toHaveBeenCalledWith(id, `1700000000000:${id}`);
});
