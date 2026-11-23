import { appOrigin } from "../test-support/environment";
import { test, type Actor } from "../test-support/fixtures";
import { expect } from "@playwright/test";

const origin = appOrigin;

/** A JSON request body of this spec. */
type RequestBody = Record<string, string | number | string[]>;

async function setActive(actor: Actor, organizationId: string) {
  const response = await actor.request.post("/api/auth/organization/set-active", {
    headers: { origin },
    data: { organizationId },
  });
  expect(response.ok()).toBe(true);
}

/** Invites `person` into the workspace and makes it their active one. */
async function join(admin: Actor, person: Actor, organizationId: string) {
  const invited = await admin.request.post("/api/auth/organization/invite-member", {
    headers: { origin },
    data: { organizationId, email: person.email, role: "member" },
  });
  expect(invited.ok()).toBe(true);
  const invitation: { id: string } = await invited.json();
  const accepted = await person.request.post("/api/auth/organization/accept-invitation", {
    headers: { origin },
    data: { invitationId: invitation.id },
  });
  expect(accepted.ok()).toBe(true);
  await setActive(person, organizationId);
}

test("only the agent's owner sets callers and decides calls; a caller sees only their own call", async ({
  actors,
  workspace: createWorkspace,
}) => {
  // The workspace owner is an admin. The member owns the agent. The recipient calls it. The
  // outsider is a partner from another organization.
  const [admin, agentOwner] = await createWorkspace(actors.owner, actors.member);
  const organizationId = admin.organizationId;
  const caller = { ...actors.recipient, organizationId };
  const partner = actors.outsider;
  await join(admin, actors.recipient, organizationId);
  try {
    const installationId = crypto.randomUUID();
    expect(
      (
        await agentOwner.request.post("/api/v1/agent-work/device/register", {
          headers: { origin },
          data: { installationId, name: "Laptop", platform: "win32" },
        })
      ).ok(),
    ).toBe(true);
    const saved = await agentOwner.request.post("/api/v1/agents/actors/save", {
      headers: { "x-substrate-installation": installationId, origin },
      data: { name: "Research", instructions: "Help", harness: "claude", enabled: true },
    });
    expect(saved.ok()).toBe(true);
    const agentId: string = (await saved.json()).data.id;
    const channel = await agentOwner.request.post("/api/v1/messaging/conversations", {
      headers: { origin },
      data: { organizationId, kind: "channel", name: `calls-${crypto.randomUUID()}` },
    });
    expect(channel.ok()).toBe(true);
    const conversationId: string = (await channel.json()).data.id;
    const added = await agentOwner.request.post("/api/v1/messaging/agents/add", {
      headers: { origin },
      data: { organizationId, conversationId, agentId },
    });
    expect(added.ok()).toBe(true);
    const agentActorId: string = (await added.json()).data.actorId;

    const post = (actor: Actor, path: string, data: RequestBody) =>
      actor.request.post(path, { headers: { origin }, data });
    const policy = (actor: Actor, value: string, org = organizationId) =>
      post(actor, "/api/v1/agents/actors/callers/policy", {
        organizationId: org,
        agentId,
        policy: value,
      });
    // Only the agent's owner changes the policy: not an admin, a caller, or a partner.
    expect((await policy(admin, "ask")).status()).toBe(404);
    expect((await policy(caller, "ask")).status()).toBe(404);
    expect((await policy(partner, "ask")).status()).toBe(403);
    expect((await policy(partner, "ask", partner.organizationId)).status()).toBe(404);
    expect((await policy(agentOwner, "ask")).ok()).toBe(true);

    const sent = await post(caller, "/api/v1/messaging/messages", {
      organizationId,
      conversationId,
      body: `@[agent:${agentActorId}] please summarize`,
    });
    expect(sent.ok()).toBe(true);
    const messageId: string = (await sent.json()).data.id;

    const list = async (actor: Actor) =>
      (
        await (
          await actor.request.get(`/api/v1/agent-work/invocations?organizationId=${organizationId}`)
        ).json()
      ).data;
    const [call] = await list(agentOwner);
    expect(call).toMatchObject({
      status: "pending_approval",
      place: { access: "visible", anchorMessageId: messageId },
    });
    expect(await list(admin)).toEqual([]);
    expect(await list(caller)).toEqual([]);
    const needsYou = await (
      await agentOwner.request.get(`/api/v1/agent-work/needs-you?organizationId=${organizationId}`)
    ).json();
    expect(needsYou.data.calls.map((entry: { id: string }) => entry.id)).toEqual([call.id]);

    const mine = async (actor: Actor, org = organizationId) =>
      actor.request.get(
        `/api/v1/agent-work/calls/mine?organizationId=${org}&conversationId=${conversationId}`,
      );
    expect((await (await mine(caller)).json()).data).toEqual([
      expect.objectContaining({ messageId, status: "waiting" }),
    ]);
    expect((await (await mine(admin)).json()).data).toEqual([]);
    expect((await mine(partner)).status()).toBe(403);

    const decide = (actor: Actor, decision: string, org = organizationId) =>
      post(actor, `/api/v1/agent-work/invocations/${call.id}/decide`, {
        organizationId: org,
        decision,
      });
    expect((await decide(caller, "approve")).status()).toBe(404);
    expect((await decide(admin, "approve")).status()).toBe(404);
    expect((await decide(partner, "approve")).status()).toBe(403);
    const approved = await decide(agentOwner, "approve");
    expect(approved.ok()).toBe(true);
    expect((await approved.json()).data).toEqual({ status: "admitted" });
    expect((await decide(agentOwner, "decline")).status()).toBe(409);
    expect((await (await mine(caller)).json()).data).toEqual([
      expect.objectContaining({ messageId, status: "queued" }),
    ]);

    // Only the home desktop that declares caller wakes receives the call.
    const pull = (data: RequestBody) =>
      agentOwner.request.post("/api/v1/agent-work/device/wakes/pull", {
        headers: { origin, "x-substrate-installation": installationId },
        data,
      });
    const device = { organizationId, installationId, limit: 50 };
    const withoutCapabilities = await pull(device);
    expect(withoutCapabilities.ok()).toBe(true);
    expect((await withoutCapabilities.json()).data).toEqual([]);
    const withCapabilities = await pull({ ...device, capabilities: ["caller_wakes"] });
    expect(withCapabilities.ok()).toBe(true);
    const pulled = (await withCapabilities.json()).data;
    expect(pulled).toEqual([
      expect.objectContaining({
        source: "caller_message",
        sourceRef: { invocationId: call.id },
        invocation: expect.objectContaining({ messageId, conversationId }),
      }),
    ]);

    // The allowlist and the Calls log belong to the agent's owner.
    const callerActorId: string = call.caller.actorId;
    const allow = (actor: Actor) =>
      post(actor, "/api/v1/agents/actors/callers/allow", {
        organizationId,
        agentId,
        callerActorId,
      });
    expect((await allow(admin)).status()).toBe(404);
    expect((await allow(caller)).status()).toBe(404);
    expect((await allow(agentOwner)).ok()).toBe(true);
    const callers = (actor: Actor) =>
      post(actor, "/api/v1/agents/actors/callers/list", { organizationId, agentId });
    expect((await callers(caller)).status()).toBe(404);
    expect((await (await callers(agentOwner)).json()).data).toMatchObject({
      policy: "ask",
      allowlist: [{ actorId: callerActorId }],
    });
    const log = (actor: Actor) =>
      actor.request.get(
        `/api/v1/agent-work/calls?organizationId=${organizationId}&userAgentId=${agentId}`,
      );
    expect((await log(admin)).status()).toBe(404);
    expect((await log(caller)).status()).toBe(404);
    const logged = (await (await log(agentOwner)).json()).data;
    expect(logged.map((event: { action: string }) => event.action)).toEqual(
      expect.arrayContaining([
        "policy_changed",
        "invocation_held",
        "invocation_approved",
        "caller_allowed",
      ]),
    );
    expect(JSON.stringify(logged)).not.toContain("please summarize");
  } finally {
    await setActive(actors.recipient, actors.recipient.organizationId);
  }
});
