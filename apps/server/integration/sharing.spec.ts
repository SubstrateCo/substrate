import { appOrigin } from "./test-support/environment";
import { test, type Actor } from "./test-support/fixtures";
import { expect } from "@playwright/test";

const origin = appOrigin;

async function createChannel(host: Actor) {
  const response = await host.request.post("/api/v1/messaging/conversations", {
    headers: { origin },
    data: {
      organizationId: host.organizationId,
      kind: "channel",
      name: `Partner ${crypto.randomUUID()}`,
      private: true,
    },
  });
  expect(response.ok()).toBe(true);
  const result: { data: { id: string } } = await response.json();
  return result.data;
}
async function invite(host: Actor, partner: Actor, conversationId: string) {
  const response = await host.request.post("/api/v1/messaging/sharing/invite", {
    headers: { origin },
    data: {
      organizationId: host.organizationId,
      conversationId,
      email: partner.email,
      shareHistory: true,
    },
  });
  expect(response.ok()).toBe(true);
  const result: { data: { id: string } } = await response.json();
  return result.data;
}

test("sharing invitation metadata is authenticated, email-bound, and cannot choose another organization", async ({
  actors: { owner: host, recipient: partner, outsider: stranger },
  request,
}) => {
  const channel = await createChannel(host);
  const invitation = await invite(host, partner, channel.id);
  const params = { invitationId: invitation.id };
  expect((await request.get("/api/v1/messaging/sharing/invitation", { params })).status()).toBe(
    401,
  );
  expect(
    (await stranger.request.get("/api/v1/messaging/sharing/invitation", { params })).status(),
  ).toBe(404);
  expect((await partner.request.get("/api/v1/messaging/sharing/invitation", { params })).ok()).toBe(
    true,
  );
  const forged = await partner.request.post("/api/v1/messaging/sharing/accept", {
    headers: { origin },
    data: {
      invitationId: invitation.id,
      organizationId: stranger.organizationId,
      shareHistory: true,
    },
  });
  expect(forged.status()).toBe(404);
  const messages = await partner.request.get("/api/v1/messaging/messages", {
    params: { organizationId: partner.organizationId, conversationId: channel.id },
  });
  expect(messages.status()).toBe(404);
});

test("organization disclosure follows channel access and the session's workspace", async ({
  actors: { owner: host, recipient: partner, outsider: stranger },
}) => {
  const channel = await createChannel(host);
  const organizations = async (actor: Actor) => {
    const response = await actor.request.get("/api/v1/messaging/conversations", {
      params: { organizationId: actor.organizationId },
    });
    expect(response.ok()).toBe(true);
    const result: {
      data: {
        id: string;
        organizations: { id: string; name: string; host: boolean; own: boolean }[];
      }[];
    } = await response.json();
    return result.data.find((row) => row.id === channel.id)?.organizations;
  };
  const invitation = await invite(host, partner, channel.id);
  expect((await organizations(host))!.map((org) => org.id)).toEqual([host.organizationId]);
  const accepted = await partner.request.post("/api/v1/messaging/sharing/accept", {
    headers: { origin },
    data: {
      invitationId: invitation.id,
      organizationId: partner.organizationId,
      shareHistory: true,
    },
  });
  expect(accepted.ok()).toBe(true);
  const disclosed = (await organizations(partner))!;
  expect(disclosed.map((org) => org.id).sort()).toEqual(
    [host.organizationId, partner.organizationId].sort(),
  );
  expect(await organizations(stranger), "An unrelated workspace learns nothing").toBeUndefined();
  expect(disclosed.find((org) => org.id === host.organizationId)).toMatchObject({
    host: true,
    own: false,
    name: expect.any(String),
  });
  const forged = await partner.request.get("/api/v1/messaging/conversations", {
    params: { organizationId: host.organizationId },
  });
  expect(forged.status()).toBe(403);
});

test("sharing writes require trusted origins and full-history confirmation", async ({
  actors: { owner: host, recipient: partner },
}) => {
  const channel = await createChannel(host);
  const data = {
    organizationId: host.organizationId,
    conversationId: channel.id,
    email: partner.email,
    shareHistory: true,
  };
  for (const untrusted of [undefined, "https://evil.example"]) {
    const response = await host.request.post("/api/v1/messaging/sharing/invite", {
      headers: untrusted ? { origin: untrusted } : {},
      data,
    });
    expect(response.status()).toBe(403);
  }
  const noWarning = await host.request.post("/api/v1/messaging/sharing/invite", {
    headers: { origin },
    data: { ...data, shareHistory: false },
  });
  expect(noWarning.status()).toBe(400);
  const details = await host.request.get("/api/v1/messaging/sharing/details", {
    params: { organizationId: host.organizationId, conversationId: channel.id },
  });
  expect((await details.json()).data.invitations).toEqual([]);
});

test("accepted access is scoped to the recipient org and disconnect revokes reads, writes, search and old links", async ({
  actors: { owner: host, recipient: partner },
}) => {
  const channel = await createChannel(host);
  const invitation = await invite(host, partner, channel.id);
  const data = {
    invitationId: invitation.id,
    organizationId: partner.organizationId,
    shareHistory: true,
  };
  const body = `Shared history ${crypto.randomUUID()}`;
  const sent = await host.request.post("/api/v1/messaging/messages", {
    headers: { origin },
    data: { organizationId: host.organizationId, conversationId: channel.id, body },
  });
  expect(sent.ok()).toBe(true);
  expect(
    (
      await partner.request.post("/api/v1/messaging/sharing/accept", { headers: { origin }, data })
    ).ok(),
  ).toBe(true);
  const before = await partner.request.get("/api/v1/messaging/messages", {
    params: { organizationId: partner.organizationId, conversationId: channel.id },
  });
  expect(before.ok()).toBe(true);
  const search = () =>
    partner.request.post("/api/v1/context/search", {
      headers: { origin },
      data: { organizationId: partner.organizationId, query: body, kind: "message" },
    });
  expect((await (await search()).json()).data).toHaveLength(1);
  const removed = await host.request.post("/api/v1/messaging/sharing/disconnect", {
    headers: { origin },
    data: {
      organizationId: host.organizationId,
      conversationId: channel.id,
      partnerOrganizationId: partner.organizationId,
    },
  });
  expect(removed.ok()).toBe(true);
  expect(
    (
      await partner.request.get("/api/v1/messaging/messages", {
        params: { organizationId: partner.organizationId, conversationId: channel.id },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await partner.request.post("/api/v1/messaging/messages", {
        headers: { origin },
        data: {
          organizationId: partner.organizationId,
          conversationId: channel.id,
          body: "blocked",
        },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await partner.request.post("/api/v1/messaging/sharing/accept", { headers: { origin }, data })
    ).status(),
  ).toBe(400);
  expect((await (await search()).json()).data).toEqual([]);
  const conversations = await partner.request.get("/api/v1/messaging/conversations", {
    params: { organizationId: partner.organizationId },
  });
  expect(
    (await conversations.json()).data.some((item: { id: string }) => item.id === channel.id),
  ).toBe(false);
});

type SharedConversationRow = {
  id: string;
  displayName: string | null;
  accessible: boolean;
  participantCount: number | null;
  partnerOrganizationName: string | null;
  status: string | null;
};
async function sharedConversations(actor: Actor) {
  const response = await actor.request.get("/api/v1/messaging/sharing/conversations", {
    params: { organizationId: actor.organizationId },
  });
  expect(response.ok()).toBe(true);
  const result: { data: SharedConversationRow[] } = await response.json();
  return new Map(result.data.map((row) => [row.id, row]));
}
async function accept(partner: Actor, invitationId: string) {
  const response = await partner.request.post("/api/v1/messaging/sharing/accept", {
    headers: { origin },
    data: { invitationId, organizationId: partner.organizationId, shareHistory: true },
  });
  expect(response.ok()).toBe(true);
}

test("the shared conversation list shows partner organizations and statuses to admins of each side only", async ({
  actors: { owner: host, member, recipient: partner, outsider: stranger },
}) => {
  const connected = await createChannel(host);
  await accept(partner, (await invite(host, partner, connected.id)).id);
  const invited = await createChannel(host);
  await invite(host, stranger, invited.id);
  const hostRows = await sharedConversations(host);
  expect(hostRows.get(connected.id)).toMatchObject({
    partnerOrganizationName: partner.name,
    status: "connected",
  });
  expect(hostRows.get(invited.id)).toMatchObject({
    partnerOrganizationName: null,
    status: "invited",
  });
  const partnerRows = await sharedConversations(partner);
  expect(partnerRows.get(connected.id)).toMatchObject({
    partnerOrganizationName: host.name,
    status: "connected",
  });
  expect(partnerRows.has(invited.id), "Partners see only connected channels").toBe(false);
  const memberRows = await sharedConversations(member);
  expect([memberRows.has(connected.id), memberRows.has(invited.id)]).toEqual([false, false]);
  const strangerRows = await sharedConversations(stranger);
  expect([strangerRows.has(connected.id), strangerRows.has(invited.id)]).toEqual([false, false]);
  const forged = await partner.request.get("/api/v1/messaging/sharing/conversations", {
    params: { organizationId: host.organizationId },
  });
  expect(forged.status()).toBe(403);
});

test("partner admins see a shared group they cannot open without its participants", async ({
  actors: { owner: host, member, recipient, outsider },
  workspace,
}) => {
  const [partnerAdmin, partnerMember] = await workspace(recipient, outsider);
  const created = await host.request.post("/api/v1/messaging/conversations", {
    headers: { origin },
    data: {
      organizationId: host.organizationId,
      kind: "group",
      emails: [member.email, partnerMember.email],
      shareHistory: true,
    },
  });
  expect(created.ok()).toBe(true);
  const group: { id: string } = (await created.json()).data;
  const inbox = await partnerMember.request.get("/api/v1/messaging/sharing/inbox", {
    params: { organizationId: partnerMember.organizationId },
  });
  const invitations: { id: string; conversationId: string }[] = (await inbox.json()).data;
  await accept(partnerMember, invitations.find((row) => row.conversationId === group.id)!.id);
  const hidden = (await sharedConversations(partnerAdmin)).get(group.id);
  expect(hidden).toMatchObject({
    displayName: null,
    accessible: false,
    participantCount: null,
    partnerOrganizationName: host.name,
    status: "connected",
  });
  expect(JSON.stringify(hidden)).not.toContain(partnerMember.name);
  expect(JSON.stringify(hidden)).not.toContain(member.name);
  expect((await sharedConversations(host)).get(group.id)).toMatchObject({
    accessible: true,
    displayName: expect.stringContaining(partnerMember.name),
  });
});
