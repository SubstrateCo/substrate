import { claimOne, host, registerDevice } from "../test-support/agent-work";
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
  const installationId = crypto.randomUUID();
  await registerDevice(owner, installationId);
  // Saved from the desktop, so the agent is homed there.
  const saved = await owner.post("/api/v1/agents/actors/save", {
    headers: { origin, "x-substrate-installation": installationId },
    data: { name: "Research", instructions: "Help", harness: "opencode", enabled: true },
  });
  expect(saved.ok()).toBe(true);
  const agentId: string = (await saved.json()).data.id;
  const dm = await owner.post("/api/v1/messaging/conversations", {
    headers: { origin },
    data: { organizationId: workspace.id, kind: "agent_dm", agentIds: [agentId] },
  });
  expect(dm.ok()).toBe(true);
  const sent = await owner.post("/api/v1/messaging/messages", {
    headers: { origin },
    data: { organizationId: workspace.id, conversationId: (await dm.json()).data.id, body: "Go" },
  });
  expect(sent.ok()).toBe(true);
  const home = host(owner, workspace.id, installationId);
  const claimed = await claimOne(home);
  expect((await home(`host/turns/${claimed.turn.id}/start`, { attempt: 1 })).ok()).toBe(true);
  // The desktop host attaches its leased turn to every call.
  const turn = { turnId: claimed.turn.id, attempt: claimed.turn.attempt };
  const data = { organizationId: workspace.id, agentId, tool: "list_projects", input: {}, turn };
  const headers = { origin, "x-substrate-installation": installationId };
  const { turn: _turn, ...withoutTurn } = data;
  expect((await owner.post("/api/v1/mcp/call", { headers, data: withoutTurn })).status()).toBe(400);
  const valid = await owner.post("/api/v1/mcp/call", { headers, data });
  for (const call of [
    { tool: "search_inbox", input: { unreadOnly: true } },
    { tool: "read_inbox_message", input: { messageId: crypto.randomUUID() } },
  ]) {
    expect(
      (await owner.post("/api/v1/mcp/call", { headers, data: { ...data, ...call } })).status(),
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
        headers,
        data: { ...data, organizationId: otherWorkspace.id },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await owner.post("/api/v1/mcp/call", {
        headers,
        data: { ...data, input: { actorEntityId: crypto.randomUUID() } },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await owner.post("/api/v1/mcp/call", {
        headers,
        data: { ...data, tool: "request_http" },
      })
    ).status(),
  ).toBe(400);
});
