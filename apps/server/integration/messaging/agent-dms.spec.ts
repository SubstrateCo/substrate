import { registerDevice } from "../test-support/agent-work";
import { appOrigin } from "../test-support/environment";
import { test } from "../test-support/fixtures";
import { expect } from "@playwright/test";

type MessagingInput = {
  kind?: string;
  agentIds?: string[];
  conversationId?: string;
  body?: string;
  emails?: readonly string[];
  email?: string;
  agentId?: string;
  shareHistory?: boolean;
};

test("agent DMs stay private to the agent owner and cannot be shared or expanded", async ({
  actors,
  workspace,
}) => {
  const [admin, owner] = await workspace(actors.owner, actors.member);
  const installationId = crypto.randomUUID();
  await registerDevice(owner.request, installationId);
  const saved = await owner.request.post("/api/v1/agents/actors/save", {
    headers: { origin: appOrigin, "x-substrate-installation": installationId },
    data: { name: "Private assistant", instructions: "Help", harness: "claude", enabled: true },
  });
  expect(saved.ok()).toBe(true);
  const agentId: string = (await saved.json()).data.id;
  const post = (endpoint: string, input: MessagingInput) =>
    owner.request.post(`/api/v1/messaging/${endpoint}`, {
      headers: { origin: appOrigin },
      data: { organizationId: owner.organizationId, ...input },
    });
  const input = { kind: "agent_dm", agentIds: [agentId] };
  for (const invalid of [
    { ...input, agentIds: [] },
    { ...input, emails: [admin.email] },
    { ...input, emails: [actors.outsider.email], shareHistory: true },
    { kind: "dm", agentIds: [agentId] },
  ]) {
    expect((await post("conversations", invalid)).status()).toBe(400);
  }
  const created = await post("conversations", input);
  expect(created.ok()).toBe(true);
  const dm: { id: string } = (await created.json()).data;
  const reopened = await post("conversations", input);
  expect(await reopened.json()).toMatchObject({
    data: { id: dm.id, kind: "agent_dm", private: true },
  });
  expect((await post("messages", { conversationId: dm.id, body: "Private request" })).ok()).toBe(
    true,
  );

  for (const [endpoint, fields] of [
    ["members", { emails: [admin.email] }],
    ["agents/add", { agentId }],
    ["conversations/join", {}],
    ["conversations/leave", {}],
    ["sharing/invite", { email: actors.outsider.email, shareHistory: true }],
  ] as const) {
    expect((await post(endpoint, { conversationId: dm.id, ...fields })).status()).toBe(404);
  }
  for (const reader of [admin, actors.outsider]) {
    const params = { organizationId: reader.organizationId, conversationId: dm.id };
    expect((await reader.request.get("/api/v1/messaging/messages", { params })).status()).toBe(404);
    const listed = await reader.request.get("/api/v1/messaging/conversations", {
      params: { organizationId: reader.organizationId },
    });
    expect((await listed.json()).data.map((item: { id: string }) => item.id)).not.toContain(dm.id);
  }
  for (const endpoint of ["conversations/managed", "sharing/conversations"]) {
    const listed = await admin.request.get(`/api/v1/messaging/${endpoint}`, {
      params: { organizationId: admin.organizationId },
    });
    expect(listed.ok()).toBe(true);
    expect((await listed.json()).data.map((item: { id: string }) => item.id)).not.toContain(dm.id);
  }
});
