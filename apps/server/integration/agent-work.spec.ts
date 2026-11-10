import type { WorkspaceApiRequest } from "@startup-os/contracts/harness/mcp";

import { provisionVerifiedAccount } from "./test-support/auth";
import { appOrigin } from "./test-support/environment";
import { Mailpit } from "./test-support/mailpit";
import { provisionWorkspaceSession } from "./test-support/organizations";
import { expect, test } from "@playwright/test";

const origin = appOrigin;

test("only the owner's home desktop receives wakes, and only the owner sees and answers requests", async ({
  playwright,
}) => {
  const owner = await playwright.request.newContext({ baseURL: origin });
  const other = await playwright.request.newContext({ baseURL: origin });
  const anonymous = await playwright.request.newContext({ baseURL: origin });
  try {
    const suffix = crypto.randomUUID();
    for (const [request, name] of [
      [owner, "owner"],
      [other, "other"],
    ] as const) {
      await provisionVerifiedAccount({ request }, new Mailpit(request), {
        name,
        email: `${name}-${suffix}@example.test`,
        password: `Work-${suffix}!`,
      });
    }
    const workspace = await provisionWorkspaceSession(owner, "Work", `work-${suffix}`);
    const otherWorkspace = await provisionWorkspaceSession(other, "Other", `other-${suffix}`);
    const installationId = crypto.randomUUID();
    expect(
      (
        await owner.post("/api/v1/agent-work/device/register", {
          headers: { origin },
          data: { installationId, name: "Laptop", platform: "win32" },
        })
      ).ok(),
    ).toBe(true);
    const saved = await owner.post("/api/v1/agents/actors/save", {
      headers: { "x-startup-os-installation": installationId, origin },
      data: { name: "Research", instructions: "Help", harness: "claude", enabled: true },
    });
    const agentId: string = (await saved.json()).data.id;
    const dm = await owner.post("/api/v1/messaging/conversations", {
      headers: { origin },
      data: { organizationId: workspace.id, kind: "dm", agentIds: [agentId] },
    });
    const conversationId: string = (await dm.json()).data.id;
    const sent = await owner.post("/api/v1/messaging/messages", {
      headers: { origin },
      data: { organizationId: workspace.id, conversationId, body: "Check the build" },
    });
    const messageId: string = (await sent.json()).data.id;

    // Device routes: a session, a trusted origin, the active workspace and a registered device.
    const pull = { organizationId: workspace.id, installationId, limit: 50 };
    const device = (
      request: typeof owner,
      path: string,
      data: {
        organizationId: string;
        installationId: string;
        limit?: number;
        messageIds?: string[];
      },
      from = origin,
    ) => request.post(`/api/v1/agent-work/device/${path}`, { headers: { origin: from }, data });
    expect((await device(anonymous, "wakes/pull", pull)).status()).toBe(401);
    expect((await device(owner, "wakes/pull", pull, "https://evil.example")).status()).toBe(403);
    expect((await device(other, "wakes/pull", pull)).status()).toBe(403);
    expect(
      (await device(other, "wakes/pull", { ...pull, organizationId: otherWorkspace.id })).status(),
    ).toBe(404);
    const pulled = await (await device(owner, "wakes/pull", pull)).json();
    expect(pulled.data).toHaveLength(1);
    expect(pulled.data[0]).toMatchObject({ sessionKey: `dm:${conversationId}` });
    const sources = await (
      await device(owner, "sources", {
        organizationId: workspace.id,
        installationId,
        messageIds: [messageId],
      })
    ).json();
    expect(sources.data.messages[0]).toMatchObject({ body: "Check the build" });

    // The owner's desktop asks through MCP; only the owner sees and answers it.
    const turn = {
      turnId: crypto.randomUUID(),
      attempt: 1,
      sessionKey: `dm:${conversationId}`,
      origin: { conversationId, threadId: null },
      kind: "interactive",
      installationId,
    };
    const asked = await owner.post("/api/v1/mcp/call", {
      headers: { origin },
      data: {
        organizationId: workspace.id,
        agentId,
        turn,
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
    const needsYou = await (
      await owner.get(`/api/v1/agent-work/needs-you?organizationId=${workspace.id}`)
    ).json();
    expect(needsYou.data.requests.map((request: { id: string }) => request.id)).toEqual([
      questionId,
    ]);
    const otherNeedsYou = await (
      await other.get(`/api/v1/agent-work/needs-you?organizationId=${otherWorkspace.id}`)
    ).json();
    expect(otherNeedsYou.data.requests).toEqual([]);
    expect(
      (
        await owner.get(`/api/v1/agent-work/needs-you?organizationId=${otherWorkspace.id}`)
      ).status(),
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
  } finally {
    await Promise.all([owner.dispose(), other.dispose(), anonymous.dispose()]);
  }
});

test("only the home desktop publishes, and a left conversation's requests are placeholders", async ({
  playwright,
}) => {
  const owner = await playwright.request.newContext({ baseURL: origin });
  const member = await playwright.request.newContext({ baseURL: origin });
  try {
    const suffix = crypto.randomUUID();
    const emails = {
      owner: `owner-${suffix}@example.test`,
      member: `member-${suffix}@example.test`,
    };
    for (const [request, name] of [
      [owner, "owner"],
      [member, "member"],
    ] as const)
      await provisionVerifiedAccount({ request }, new Mailpit(request), {
        name,
        email: emails[name],
        password: `Work-${suffix}!`,
      });
    const workspace = await provisionWorkspaceSession(owner, "Work", `work-${suffix}`);
    await provisionWorkspaceSession(member, "Member", `member-${suffix}`);
    const invited = await owner.post("/api/auth/organization/invite-member", {
      headers: { origin },
      data: { email: emails.member, role: "member" },
    });
    const invitation = await invited.json();
    for (const [path, data] of [
      ["accept-invitation", { invitationId: invitation.id }],
      ["set-active", { organizationId: workspace.id }],
    ] as const)
      expect(
        (await member.post(`/api/auth/organization/${path}`, { headers: { origin }, data })).ok(),
      ).toBe(true);

    const register = async (installationId: string) =>
      expect(
        (
          await owner.post("/api/v1/agent-work/device/register", {
            headers: { origin },
            data: { installationId, name: "Laptop", platform: "win32" },
          })
        ).ok(),
      ).toBe(true);
    const home = crypto.randomUUID();
    const other = crypto.randomUUID();
    await register(home);
    await register(other);
    const saved = await owner.post("/api/v1/agents/actors/save", {
      headers: { "x-startup-os-installation": home, origin },
      data: { name: "Research", instructions: "Help", harness: "claude", enabled: true },
    });
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
    const conversationId: string = (await channel.json()).data.id;
    const root = await member.post("/api/v1/messaging/messages", {
      headers: { origin },
      data: { organizationId: workspace.id, conversationId, body: `${secret} root` },
    });
    const rootId: string = (await root.json()).data.id;

    const turn = (installationId?: string) => ({
      turnId: crypto.randomUUID(),
      attempt: 1,
      sessionKey: `thread:${rootId}`,
      origin: { conversationId, threadId: rootId },
      kind: "interactive",
      installationId,
    });
    const call = (
      installationId: string | undefined,
      tool: WorkspaceApiRequest["tool"],
      input: WorkspaceApiRequest["input"],
    ) =>
      owner.post("/api/v1/mcp/call", {
        headers: { origin },
        data: { organizationId: workspace.id, agentId, turn: turn(installationId), tool, input },
      });
    const reply = (installationId?: string) =>
      call(installationId, "reply", {
        requestId: crypto.randomUUID(),
        body: `${secret} body`,
        ask: { question: `${secret} question?`, options: [{ label: `${secret} option` }] },
      });
    // Another of the owner's desktops, or a call without a desktop, cannot publish.
    expect((await reply(other)).status()).toBe(404);
    expect((await reply()).status()).toBe(404);
    expect((await call(other, "list_projects", {})).ok()).toBe(true);
    expect((await reply(home)).ok()).toBe(true);
    expect(
      (
        await call(home, "propose", {
          requestId: crypto.randomUUID(),
          summary: `${secret} summary`,
          action: { type: "reply_elsewhere", input: { conversationId, body: `${secret} action` } },
        })
      ).ok(),
    ).toBe(true);

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
    expect(needsYou.data.requests).toHaveLength(2);
    for (const request of needsYou.data.requests)
      expect(request).toMatchObject({
        sessionKey: null,
        place: { access: "hidden" },
        payload: null,
        response: null,
        proposal: null,
      });
    const text = JSON.stringify(needsYou);
    for (const hidden of [secret, conversationId, rootId]) expect(text).not.toContain(hidden);
  } finally {
    await Promise.all([owner.dispose(), member.dispose()]);
  }
});
