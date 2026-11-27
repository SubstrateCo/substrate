import type { WorkspaceApiRequest } from "@substrate/contracts/agent-tools/mcp";
import { sessionKeys } from "@substrate/contracts/agent-work";

import { claimOne, host, registerDevice } from "../test-support/agent-work";
import { appOrigin } from "../test-support/environment";
import { test } from "../test-support/fixtures";
import { expect } from "@playwright/test";

const origin = appOrigin;

test("only the owner's home desktop claims work, and only the owner sees and answers requests", async ({
  actors,
  workspace: createWorkspace,
  request: anonymous,
}) => {
  // A fresh workspace, so the owner's Needs-you list holds only this test's request.
  const [scoped] = await createWorkspace(actors.owner);
  const owner = scoped.request;
  const other = actors.outsider.request;
  const workspace = { id: scoped.organizationId };
  const otherWorkspace = { id: actors.outsider.organizationId };
  const installationId = crypto.randomUUID();
  await registerDevice(owner, installationId);

  const saved = await owner.post("/api/v1/agents/actors/save", {
    headers: { "x-substrate-installation": installationId, origin },
    data: { name: "Research", instructions: "Help", harness: "claude", enabled: true },
  });
  expect(saved.ok()).toBe(true);
  const agentId: string = (await saved.json()).data.id;
  const dm = await owner.post("/api/v1/messaging/conversations", {
    headers: { origin },
    data: { organizationId: workspace.id, kind: "agent_dm", agentIds: [agentId] },
  });
  expect(dm.ok()).toBe(true);
  const conversationId: string = (await dm.json()).data.id;
  const sent = await owner.post("/api/v1/messaging/messages", {
    headers: { origin },
    data: { organizationId: workspace.id, conversationId, body: "Check the build" },
  });
  expect(sent.ok()).toBe(true);
  const messageId: string = (await sent.json()).data.id;

  const home = host(owner, workspace.id, installationId);
  expect((await host(anonymous, workspace.id, installationId)("host/claim")).status()).toBe(401);
  expect((await home("host/claim", {}, "https://evil.example")).status()).toBe(403);
  expect((await host(other, workspace.id, installationId)("host/claim")).status()).toBe(403);
  expect((await host(other, otherWorkspace.id, installationId)("host/claim")).status()).toBe(404);
  const claimed = await claimOne(home);
  expect(claimed.session.key).toBe(sessionKeys.dm(conversationId));
  const sources = await (await home("device/sources", { messageIds: [messageId] })).json();
  expect(sources.data.messages[0]).toMatchObject({ body: "Check the build" });
  expect((await home(`host/turns/${claimed.turn.id}/start`, { attempt: 1 })).ok()).toBe(true);

  // The owner's desktop asks through MCP in the claimed turn; only the owner sees and answers it.
  const asked = await owner.post("/api/v1/mcp/call", {
    headers: { origin, "x-substrate-installation": installationId },
    data: {
      organizationId: workspace.id,
      agentId,
      turn: { turnId: claimed.turn.id, attempt: 1 },
      tool: "reply",
      input: {
        requestId: crypto.randomUUID(),
        body: "Which branch?",
        ask: { question: "Which branch?" },
      },
    },
  });
  expect(asked.ok()).toBe(true);
  const questionId: string = (await asked.json()).data.questionId;
  const finished = await home(`host/turns/${claimed.turn.id}/finish`, {
    attempt: 1,
    status: "completed",
    outcome: "asked",
  });
  expect(finished.ok()).toBe(true);
  const needsYou = await (
    await owner.get(`/api/v1/agent-work/needs-you?organizationId=${workspace.id}`)
  ).json();
  expect(needsYou.data.requests.map((request: { id: string }) => request.id)).toEqual([questionId]);
  const otherNeedsYou = await (
    await other.get(`/api/v1/agent-work/needs-you?organizationId=${otherWorkspace.id}`)
  ).json();
  expect(otherNeedsYou.data.requests).toEqual([]);
  expect(
    (await owner.get(`/api/v1/agent-work/needs-you?organizationId=${otherWorkspace.id}`)).status(),
  ).toBe(403);

  const answer = { type: "questions", answers: { answer: ["main"] } };
  const respond = (request: typeof owner, organizationId: string) =>
    request.post(`/api/v1/agent-work/requests/${questionId}/respond`, {
      headers: { origin },
      data: { organizationId, response: answer },
    });
  expect((await respond(other, otherWorkspace.id)).status()).toBe(404);
  expect((await respond(owner, workspace.id)).ok()).toBe(true);
  expect((await respond(owner, workspace.id)).status()).toBe(409);
  // The answer is new work in the question's session.
  expect((await claimOne(home)).session.key).toBe(sessionKeys.dm(conversationId));
});

test("only the home desktop's turn runs tools, and a left conversation's requests are placeholders", async ({
  actors,
  workspace: createWorkspace,
}) => {
  // A fresh workspace, so the owner's Needs-you list holds only this test's request.
  const [scopedOwner, scopedMember] = await createWorkspace(actors.owner, actors.member);
  const owner = scopedOwner.request;
  const member = scopedMember.request;
  const workspace = { id: scopedOwner.organizationId };
  const emails = { owner: actors.owner.email };
  const suffix = crypto.randomUUID();

  const home = crypto.randomUUID();
  const other = crypto.randomUUID();
  await registerDevice(owner, home);
  await registerDevice(owner, other);

  const saved = await owner.post("/api/v1/agents/actors/save", {
    headers: { "x-substrate-installation": home, origin },
    data: { name: "Research", instructions: "Help", harness: "claude", enabled: true },
  });
  expect(saved.ok()).toBe(true);
  const agentId: string = (await saved.json()).data.id;

  const secret = `secret-${suffix}`;
  const channel = await member.post("/api/v1/messaging/conversations", {
    headers: { origin },
    data: {
      organizationId: workspace.id,
      kind: "channel",
      name: secret,
      private: true,
      emails: [emails.owner],
    },
  });
  expect(channel.ok()).toBe(true);
  const conversationId: string = (await channel.json()).data.id;
  const root = await member.post("/api/v1/messaging/messages", {
    headers: { origin },
    data: { organizationId: workspace.id, conversationId, body: `${secret} root` },
  });
  expect(root.ok()).toBe(true);
  const rootId: string = (await root.json()).data.id;
  // The owner asks in their DM; the agent's interactive turn replies in the member's thread.
  const dm = await owner.post("/api/v1/messaging/conversations", {
    headers: { origin },
    data: { organizationId: workspace.id, kind: "agent_dm", agentIds: [agentId] },
  });
  expect(dm.ok()).toBe(true);
  const dmId: string = (await dm.json()).data.id;
  const ask = await owner.post("/api/v1/messaging/messages", {
    headers: { origin },
    data: { organizationId: workspace.id, conversationId: dmId, body: "Ask in the thread" },
  });
  expect(ask.ok()).toBe(true);
  const claimed = await claimOne(host(owner, workspace.id, home));
  expect(claimed.session.key).toBe(sessionKeys.dm(dmId));

  const call = (
    installationId: string | undefined,
    tool: WorkspaceApiRequest["tool"],
    input: WorkspaceApiRequest["input"],
  ) =>
    owner.post("/api/v1/mcp/call", {
      headers: installationId ? { origin, "x-substrate-installation": installationId } : { origin },
      data: {
        organizationId: workspace.id,
        agentId,
        turn: { turnId: claimed.turn.id, attempt: claimed.turn.attempt },
        tool,
        input,
      },
    });
  const reply = (installationId?: string) =>
    call(installationId, "reply", {
      requestId: crypto.randomUUID(),
      to: { conversationId, threadId: rootId },
      body: `${secret} body`,
      ask: { question: `${secret} question?`, options: [{ label: `${secret} option` }] },
    });
  // Another of the owner's desktops, or a call without a desktop, runs no tool, not even a read.
  expect((await reply(other)).status()).toBe(404);
  expect((await reply()).status()).toBe(404);
  expect((await call(other, "list_projects", {})).status()).toBe(404);
  expect((await reply(home)).ok()).toBe(true);
  // A stale attempt of the same turn runs nothing.
  const stale = await owner.post("/api/v1/mcp/call", {
    headers: { origin, "x-substrate-installation": home },
    data: {
      organizationId: workspace.id,
      agentId,
      turn: { turnId: claimed.turn.id, attempt: claimed.turn.attempt + 1 },
      tool: "list_projects",
      input: {},
    },
  });
  expect(stale.status()).toBe(409);

  expect(
    (
      await owner.post("/api/v1/messaging/conversations/leave", {
        headers: { origin },
        data: { organizationId: workspace.id, conversationId },
      })
    ).ok(),
  ).toBe(true);
  const needsYou = await (
    await owner.get(`/api/v1/agent-work/needs-you?organizationId=${workspace.id}`)
  ).json();
  expect(needsYou.data.requests).toHaveLength(1);
  for (const request of needsYou.data.requests) {
    expect(request.place).toEqual({ access: "hidden" });
    for (const field of ["sessionKey", "payload", "response", "proposal"])
      expect(request).not.toHaveProperty(field);
  }
  const text = JSON.stringify(needsYou);
  for (const hidden of [secret, conversationId, rootId]) expect(text).not.toContain(hidden);
});
