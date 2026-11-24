import { sessionKeys } from "@substrate/contracts/agent-work";

import { appOrigin } from "../test-support/environment";
import { test } from "../test-support/fixtures";
import { expect } from "@playwright/test";

const origin = appOrigin;

test("MCP calls require a verified owner, active workspace, trusted origin and strict tool input", async ({
  actors,
  workspace: createWorkspace,
  request: anonymous,
}) => {
  // A fresh workspace, so the agent can list no projects that other tests created.
  const [scoped] = await createWorkspace(actors.owner);
  const owner = scoped.request;
  const other = actors.outsider.request;
  const workspace = { id: scoped.organizationId };
  const otherWorkspace = { id: actors.outsider.organizationId };
  const saved = await owner.post("/api/v1/agents/actors/save", {
    headers: { origin },
    data: { name: "Research", instructions: "Help", harness: "opencode", enabled: true },
  });
  expect(saved.ok()).toBe(true);
  const agentId: string = (await saved.json()).data.id;
  // The desktop host attaches the turn to every call. A routine turn has no source message.
  const turn = {
    turnId: crypto.randomUUID(),
    attempt: 1,
    sessionKey: sessionKeys.routine(crypto.randomUUID()),
    origin: null,
    kind: "unattended",
  };
  const data = { organizationId: workspace.id, agentId, tool: "list_projects", input: {}, turn };
  const { turn: _turn, ...withoutTurn } = data;
  expect(
    (await owner.post("/api/v1/mcp/call", { headers: { origin }, data: withoutTurn })).status(),
  ).toBe(400);
  const valid = await owner.post("/api/v1/mcp/call", { headers: { origin }, data });
  for (const call of [
    { tool: "search_inbox", input: { unreadOnly: true } },
    { tool: "read_inbox_message", input: { messageId: crypto.randomUUID() } },
  ]) {
    expect(
      (
        await owner.post("/api/v1/mcp/call", { headers: { origin }, data: { ...data, ...call } })
      ).status(),
    ).toBe(400);
  }
  expect(valid.ok()).toBe(true);
  expect(await valid.json()).toEqual({ success: true, data: { items: [], nextCursor: null } });
  expect((await anonymous.post("/api/v1/mcp/call", { headers: { origin }, data })).status()).toBe(
    401,
  );
  expect(
    (
      await owner.post("/api/v1/mcp/call", { headers: { origin: "https://evil.example" }, data })
    ).status(),
  ).toBe(403);
  expect(
    (
      await other.post("/api/v1/mcp/call", {
        headers: { origin },
        data: { ...data, organizationId: otherWorkspace.id },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await owner.post("/api/v1/mcp/call", {
        headers: { origin },
        data: { ...data, organizationId: otherWorkspace.id },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await owner.post("/api/v1/mcp/call", {
        headers: { origin },
        data: { ...data, input: { actorEntityId: crypto.randomUUID() } },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await owner.post("/api/v1/mcp/call", {
        headers: { origin },
        data: { ...data, tool: "request_http" },
      })
    ).status(),
  ).toBe(400);
});
