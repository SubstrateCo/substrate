import type { conversationInput, messageInput } from "@startup-os/contracts/messaging/input";
import type { ServiceResult } from "@startup-os/contracts/result";

import { provisionVerifiedAccount } from "./test-support/auth";
import { Mailpit } from "./test-support/mailpit";
import { provisionWorkspaceSession, type WorkspaceAccount } from "./test-support/organizations";
import { expect, test as base, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import type { z } from "zod";

const origin = new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").origin;

type MessagingInput = {
  conversations: Omit<z.input<typeof conversationInput>, "organizationId">;
  messages: Omit<z.input<typeof messageInput>, "organizationId">;
};

const test = base.extend<{
  accounts: { owner: WorkspaceAccount; member: WorkspaceAccount; outsider: WorkspaceAccount };
}>({
  accounts: async ({ playwright }, use) => {
    const contexts: APIRequestContext[] = [];
    const account = async (kind: string): Promise<WorkspaceAccount> => {
      const request = await playwright.request.newContext({ baseURL: origin });
      contexts.push(request);
      const suffix = randomUUID();
      const email = `${kind}-${suffix}@example.test`;
      await provisionVerifiedAccount({ request }, new Mailpit(request), {
        name: kind,
        email,
        password: `Profiles-${suffix}!`,
      });
      const organization = await provisionWorkspaceSession(request, kind, `${kind}-${suffix}`);
      return { request, email, organizationId: organization.id };
    };
    try {
      const [owner, member, outsider] = await Promise.all([
        account("owner"),
        account("member"),
        account("outsider"),
      ]);
      const invited = await owner.request.post("/api/auth/organization/invite-member", {
        headers: { origin },
        data: { email: member.email, role: "member" },
      });
      expect(invited.ok()).toBe(true);
      const invitation = await invited.json();
      for (const [path, data] of [
        ["/api/auth/organization/accept-invitation", { invitationId: invitation.id }],
        ["/api/auth/organization/set-active", { organizationId: owner.organizationId }],
      ] as const)
        expect((await member.request.post(path, { headers: { origin }, data })).ok()).toBe(true);
      member.organizationId = owner.organizationId;
      await use({ owner, member, outsider });
    } finally {
      await Promise.all(contexts.map((context) => context.dispose()));
    }
  },
});

async function post<T, E extends keyof MessagingInput = keyof MessagingInput>(
  account: WorkspaceAccount,
  endpoint: E,
  input: MessagingInput[E],
) {
  const response = await account.request.post(`/api/v1/messaging/${endpoint}`, {
    headers: { origin },
    data: { organizationId: account.organizationId, ...input },
  });
  expect(response.ok()).toBe(true);
  const result: ServiceResult<T> = await response.json();
  if (!result.success) throw new Error(result.error.message);
  return result.data;
}

const profile = (
  account: WorkspaceAccount,
  conversationId: string,
  actorId: string,
  organizationId?: string,
) =>
  account.request.get("/api/v1/messaging/profiles", {
    params: { organizationId: organizationId ?? account.organizationId, conversationId, actorId },
  });

test("profiles resolve only through visible conversations and keep contact details in the workspace", async ({
  accounts: { owner, member, outsider },
}) => {
  const channel = await post<{ id: string }>(owner, "conversations", {
    kind: "channel",
    name: "profiles",
  });
  const hidden = await post<{ id: string }>(owner, "conversations", {
    kind: "channel",
    name: "hidden-profiles",
    private: true,
  });
  const sent = await post<{ authorActorEntityId: string }>(owner, "messages", {
    conversationId: channel.id,
    body: "Hello",
  });
  await post(owner, "messages", { conversationId: hidden.id, body: "Private" });
  const ownerActorId = sent.authorActorEntityId;

  const visible = await profile(member, channel.id, ownerActorId);
  expect(visible.status()).toBe(200);
  expect(await visible.json()).toEqual({
    success: true,
    data: {
      id: ownerActorId,
      type: "human",
      name: "owner",
      self: false,
      external: false,
      email: owner.email,
      image: null,
      role: "owner",
      directConversationId: null,
      agent: null,
    },
  });

  for (const response of [
    // A private channel hides its authors from nonparticipants.
    await profile(member, hidden.id, ownerActorId),
    // Another workspace cannot use its own session scope or the owner's workspace ID.
    await profile(outsider, channel.id, ownerActorId),
    await profile(outsider, channel.id, ownerActorId, owner.organizationId),
    // An unrelated actor ID does not resolve.
    await profile(member, channel.id, randomUUID()),
  ]) {
    expect(response.ok()).toBe(false);
    const result = await response.json();
    expect(result.success).toBe(false);
    expect(result.data).toBeUndefined();
  }
});
