import { failure, publicFailure, success } from "@substrate/contracts/result";

import { createAgentsRoutes } from "./routes";
import * as services from "./service";
import { expect, mock, test } from "bun:test";

test("rejects invalid IDs, scope injection and device assignments before calling services", async () => {
  const spies = {
    ...services,
    saveAgent: mock(services.saveAgent),
    deleteAgent: mock(services.deleteAgent),
    setAgentPicture: mock(services.setAgentPicture),
  };
  const app = createAgentsRoutes(spies);
  for (const [path, input] of [
    ["/actors/save", { userId: "other" }],
    ["/actors/delete", { id: "invalid" }],
    ["/actors/picture", { id: crypto.randomUUID(), fileId: "https://example.com/avatar.png" }],
    ["/actors/picture", { id: crypto.randomUUID(), fileId: null, userId: "other" }],
    [
      "/actors/save",
      {
        name: "Helper",
        instructions: "Help",
        harness: "opencode",
        enabled: true,
        image: "https://example.com/avatar.png",
      },
    ],
    [
      "/actors/save",
      {
        name: "Helper",
        instructions: "Help",
        harness: "opencode",
        enabled: true,
        skillIds: [crypto.randomUUID()],
      },
    ],
  ] as const) {
    const response = await app.request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(publicFailure("INVALID_INPUT", "Invalid request input."));
  }
  for (const spy of [spies.saveAgent, spies.deleteAgent, spies.setAgentPicture])
    expect(spy).not.toHaveBeenCalled();
  for (const path of ["/skills/save", "/skills/delete", "/mcp/save", "/mcp/delete"]) {
    expect((await app.request(path, { method: "POST" })).status).toBe(404);
  }
});

test("picture endpoint returns configurations, accepts clearing, and maps ownership failures", async () => {
  const id = crypto.randomUUID();
  const fileId = crypto.randomUUID();
  const configuration = {
    id,
    name: "Helper",
    instructions: "Help",
    harness: "opencode" as const,
    enabled: true,
    useStartupDefaults: true,
    image: null,
  };
  const setAgentPicture = mock(
    async (_headers: Headers, input: { id: string; fileId: string | null }) =>
      input.fileId
        ? failure("NOT_FOUND", "Item not found or access denied.")
        : success(configuration),
  );
  const app = createAgentsRoutes({ ...services, setAgentPicture });
  for (const value of [fileId, null]) {
    const response = await app.request("/actors/picture", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, fileId: value }),
    });
    expect(response.status).toBe(value ? 404 : 200);
    if (!value) expect(await response.json()).toEqual(success(configuration));
    expect(setAgentPicture).toHaveBeenCalledWith(expect.any(Headers), { id, fileId: value });
  }
});

test("list uses POST without a body and mutations map ownership errors", async () => {
  const listAgents = mock(async () => success({ agents: [], runSettings: [] }));
  const deleteAgent = mock(async () => failure("NOT_FOUND", "Item not found or access denied."));
  const app = createAgentsRoutes({ ...services, listAgents, deleteAgent });
  const response = await app.request("/list", { method: "POST" });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(success({ agents: [], runSettings: [] }));
  const id = crypto.randomUUID();
  const deleted = await app.request("/actors/delete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id }),
  });
  expect(deleted.status).toBe(404);
  expect(deleteAgent).toHaveBeenCalledWith(expect.any(Headers), { id });
});
