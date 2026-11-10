import type { conversationInput, messageInput } from "@startup-os/contracts/messaging/input";
import type { ServiceResult } from "@startup-os/contracts/result";

import { provisionVerifiedAccount } from "./test-support/auth";
import { appOrigin } from "./test-support/environment";
import { Mailpit } from "./test-support/mailpit";
import { provisionWorkspaceSession, type WorkspaceAccount } from "./test-support/organizations";
import { expect, test as base, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import type { z } from "zod";

const origin = appOrigin;

const test = base.extend<{
  actors: {
    owner: WorkspaceAccount;
    member: WorkspaceAccount;
    outsider: WorkspaceAccount;
    recipient: WorkspaceAccount;
  };
}>({
  actors: async ({ playwright }, use) => {
    const contexts: APIRequestContext[] = [];
    const account = async (kind: string): Promise<WorkspaceAccount> => {
      const request = await playwright.request.newContext({ baseURL: origin });
      contexts.push(request);
      const suffix = randomUUID();
      const email = `${kind}-${suffix}@example.test`;
      await provisionVerifiedAccount({ request }, new Mailpit(request), {
        name: kind,
        email,
        password: `Messaging-${suffix}!`,
      });
      const organization = await provisionWorkspaceSession(request, kind, `${kind}-${suffix}`);
      return { request, email, organizationId: organization.id };
    };
    try {
      const [owner, member, outsider, recipient] = await Promise.all([
        account("owner"),
        account("member"),
        account("outsider"),
        account("recipient"),
      ]);
      const invited = await owner.request.post("/api/auth/organization/invite-member", {
        headers: { origin },
        data: { email: member.email, role: "member" },
      });
      expect(invited.ok()).toBe(true);
      const invitation = await invited.json();
      expect(
        (
          await member.request.post("/api/auth/organization/accept-invitation", {
            headers: { origin },
            data: { invitationId: invitation.id },
          })
        ).ok(),
      ).toBe(true);
      expect(
        (
          await member.request.post("/api/auth/organization/set-active", {
            headers: { origin },
            data: { organizationId: owner.organizationId },
          })
        ).ok(),
      ).toBe(true);
      member.organizationId = owner.organizationId;
      await use({ owner, member, outsider, recipient });
    } finally {
      await Promise.all(contexts.map((context) => context.dispose()));
    }
  },
});

type Mutation =
  | Omit<z.input<typeof conversationInput>, "organizationId">
  | Omit<z.input<typeof messageInput>, "organizationId">;

async function post<T>(
  actor: WorkspaceAccount,
  endpoint: "conversations" | "messages",
  input: Mutation,
) {
  const response = await actor.request.post(`/api/v1/messaging/${endpoint}`, {
    headers: { origin },
    data: { organizationId: actor.organizationId, ...input },
  });
  expect(response.ok()).toBe(true);
  const result: ServiceResult<T> = await response.json();
  expect(result.success).toBe(true);
  if (!result.success) throw new Error(result.error.message);
  return result.data;
}

test("reaction lookup returns bounded actors and enforces private conversation access", async ({
  actors: { owner, member, outsider },
}) => {
  const channel = await post<{ id: string }>(member, "conversations", {
    kind: "channel",
    private: true,
    name: "private-reactions",
  });
  const message = await post<{ id: string }>(member, "messages", {
    conversationId: channel.id,
    body: "Private reactions",
  });
  expect(
    (
      await member.request.post("/api/v1/messaging/reactions", {
        headers: { origin },
        data: { organizationId: member.organizationId, messageId: message.id, emoji: "👍" },
      })
    ).ok(),
  ).toBe(true);
  const query = {
    organizationId: member.organizationId,
    messageId: message.id,
    emoji: "👍",
    limit: "3",
  };
  const response = await member.request.get("/api/v1/messaging/reactions", { params: query });
  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({
    success: true,
    data: { items: [{ name: "member", self: true, emojis: ["👍"] }], nextCursor: null },
  });
  for (const actor of [owner, outsider]) {
    const denied = await actor.request.get("/api/v1/messaging/reactions", {
      params: { ...query, organizationId: actor.organizationId },
    });
    expect(denied.status()).toBe(404);
    expect(await denied.json()).toMatchObject({ success: false, error: { code: "NOT_FOUND" } });
  }
  const invalid = await member.request.get("/api/v1/messaging/reactions", {
    params: { ...query, limit: "51" },
  });
  expect(invalid.status()).toBe(400);
});

test("channel and thread references enforce target access through search, send and resolution", async ({
  actors: { owner, member, outsider },
}) => {
  const source = await post<{ id: string }>(owner, "conversations", {
    kind: "channel",
    name: "reference-source",
  });
  const target = await post<{ id: string }>(owner, "conversations", {
    kind: "channel",
    name: "private-reference-target",
    private: true,
  });
  const root = await post<{ id: string }>(owner, "messages", {
    conversationId: target.id,
    body: "Private reference thread",
  });
  await post(owner, "messages", {
    conversationId: target.id,
    threadId: root.id,
    body: "Searchable reply",
  });
  const body = `See @[channel:${target.id}] and @[thread:${root.id}]`;
  const sent = await post<{ id: string }>(owner, "messages", { conversationId: source.id, body });
  for (const [actor, expectedIds] of [
    [owner, [target.id]],
    [member, []],
    [outsider, []],
  ] as const) {
    const search = await actor.request.post("/api/v1/context/search", {
      data: {
        organizationId: actor.organizationId,
        kind: "channel",
        query: "private-reference-target",
      },
    });
    expect(search.ok()).toBe(true);
    expect((await search.json()).data.map((item: { id: string }) => item.id)).toEqual(expectedIds);
    const threads = await actor.request.post("/api/v1/context/search", {
      data: { organizationId: actor.organizationId, kind: "thread", query: "Searchable reply" },
    });
    expect(threads.ok()).toBe(true);
    expect((await threads.json()).data.map((item: { id: string }) => item.id)).toEqual(
      actor === owner ? [root.id] : [],
    );
  }
  for (const actor of [owner, member]) {
    const page = await actor.request.post("/api/v1/context/message-page", {
      data: { organizationId: actor.organizationId, messageIds: [sent.id] },
    });
    expect(page.ok()).toBe(true);
    const references = (await page.json()).data[0].messaging;
    expect(references.map((item: { id: string }) => item.id).sort()).toEqual(
      actor === owner ? [target.id, root.id].sort() : [],
    );
  }
  for (const forbiddenBody of [body, `@[channel:${source.id}] @[thread:${crypto.randomUUID()}]`]) {
    const rejected = await member.request.post("/api/v1/messaging/messages", {
      headers: { origin },
      data: {
        organizationId: member.organizationId,
        conversationId: source.id,
        body: forbiddenBody,
      },
    });
    expect(rejected.status()).toBe(404);
    expect(await rejected.json()).toMatchObject({ success: false, error: { code: "NOT_FOUND" } });
  }
  const messages = await owner.request.get("/api/v1/messaging/messages", {
    params: { organizationId: owner.organizationId, conversationId: source.id },
  });
  expect((await messages.json()).data.map((item: { id: string }) => item.id)).toEqual([sent.id]);
});

test("messaging writes reject missing, foreign and opaque origins without persisting changes", async ({
  actors: { owner },
}) => {
  const conversation = await post<{ id: string }>(owner, "conversations", {
    kind: "channel",
    name: "origin-boundary",
  });
  for (const rejectedOrigin of [undefined, "https://foreign.example.test", "null"]) {
    for (const [endpoint, input] of [
      ["conversations", { kind: "channel", name: "rejected-origin" }],
      ["messages", { conversationId: conversation.id, body: "Rejected origin message" }],
    ] as const) {
      const response = await owner.request.post(`/api/v1/messaging/${endpoint}`, {
        headers: rejectedOrigin === undefined ? {} : { origin: rejectedOrigin },
        data: { organizationId: owner.organizationId, ...input },
      });
      expect(response.status()).toBe(403);
      expect(await response.json()).toMatchObject({ success: false, error: { code: "FORBIDDEN" } });
    }
  }
  const conversations = await owner.request.get("/api/v1/messaging/conversations", {
    params: { organizationId: owner.organizationId },
  });
  expect((await conversations.json()).data.map((item: { name: string }) => item.name)).toEqual([
    "origin-boundary",
  ]);
  const messages = await owner.request.get("/api/v1/messaging/messages", {
    params: { organizationId: owner.organizationId, conversationId: conversation.id },
  });
  expect((await messages.json()).data).toEqual([]);
});

test("conversation management checks origin, ownership, and the owning organization's admins", async ({
  actors: { owner, member, outsider },
}) => {
  const manage = (
    actor: WorkspaceAccount,
    action: "delete" | "leave",
    conversationId: string,
    headers: Record<string, string> = { origin },
  ) =>
    actor.request.post(`/api/v1/messaging/conversations/${action}`, {
      headers,
      data: { organizationId: actor.organizationId, conversationId },
    });
  const own = await post<{ id: string }>(owner, "conversations", {
    kind: "channel",
    name: "owner-channel",
  });
  const secret = await post<{ id: string }>(member, "conversations", {
    kind: "channel",
    name: "member-secret",
    private: true,
  });
  await post(member, "messages", { conversationId: secret.id, body: "Private words" });

  for (const action of ["delete", "leave"] as const) {
    const response = await manage(member, action, own.id, {});
    expect(response.status()).toBe(403);
  }
  const notOwner = await manage(member, "delete", own.id);
  expect(notOwner.status()).toBe(404);
  const foreign = await manage(outsider, "delete", secret.id);
  expect(foreign.status()).toBe(404);
  const memberManaged = await member.request.get("/api/v1/messaging/conversations/managed", {
    params: { organizationId: member.organizationId },
  });
  expect(memberManaged.status()).toBe(404);

  // The organization owner manages the member's private channel without reading it.
  const managed = await owner.request.get("/api/v1/messaging/conversations/managed", {
    params: { organizationId: owner.organizationId },
  });
  expect((await managed.json()).data.map((item: { id: string }) => item.id).sort()).toEqual(
    [own.id, secret.id].sort(),
  );
  const read = await owner.request.get("/api/v1/messaging/messages", {
    params: { organizationId: owner.organizationId, conversationId: secret.id },
  });
  expect(read.status()).toBe(404);
  const deleted = await manage(owner, "delete", secret.id);
  expect(await deleted.json()).toEqual({ success: true, data: { deleted: true } });
  const listed = await member.request.get("/api/v1/messaging/conversations", {
    params: { organizationId: member.organizationId },
  });
  expect((await listed.json()).data.map((item: { id: string }) => item.id)).toEqual([own.id]);
});

for (const kind of ["channel", "dm", "group"] as const) {
  test(`nonparticipants cannot read or mutate a private ${kind}`, async ({
    actors: { owner, member, outsider, recipient },
  }) => {
    const emails = kind === "channel" ? [] : [member.email];
    if (kind === "group") emails.push(recipient.email);
    const conversation = await post<{ id: string }>(owner, "conversations", {
      kind,
      name: "private-api-boundary",
      private: true,
      emails,
      shareHistory: true,
    });
    if (kind === "group") {
      const inbox = await recipient.request.get("/api/v1/messaging/sharing/inbox", {
        params: { organizationId: recipient.organizationId },
      });
      const invitation = (await inbox.json()).data.find(
        (item: { conversationId: string }) => item.conversationId === conversation.id,
      );
      expect(invitation).toBeDefined();
      const accepted = await recipient.request.post("/api/v1/messaging/sharing/accept", {
        headers: { origin },
        data: {
          organizationId: recipient.organizationId,
          invitationId: invitation.id,
          shareHistory: true,
        },
      });
      expect(accepted.ok()).toBe(true);
    }
    const root = await post<{ id: string }>(owner, "messages", {
      conversationId: conversation.id,
      body: "Private root",
    });
    const deniedActors = kind === "channel" ? [member, outsider] : [outsider];
    for (const actor of deniedActors) {
      const params = { organizationId: actor.organizationId, conversationId: conversation.id };
      const responses = [
        await actor.request.post("/api/v1/context/message-page", {
          data: { organizationId: actor.organizationId, messageIds: [root.id] },
        }),
        await actor.request.get("/api/v1/messaging/messages", { params }),
        await actor.request.get("/api/v1/messaging/messages", {
          params: { ...params, threadId: root.id },
        }),
        ...(await Promise.all(
          (
            [
              ["messages", { conversationId: conversation.id, body: "Unauthorized root" }],
              [
                "messages",
                { conversationId: conversation.id, threadId: root.id, body: "Unauthorized reply" },
              ],
              ["reactions", { messageId: root.id, emoji: "👍" }],
              ["members", { conversationId: conversation.id, emails: [actor.email] }],
            ] as const
          ).map(([endpoint, input]) =>
            actor.request.post(`/api/v1/messaging/${endpoint}`, {
              headers: { origin },
              data: { organizationId: actor.organizationId, ...input },
            }),
          ),
        )),
      ];
      for (const response of responses) {
        expect(response.status()).toBe(404);
        const result = await response.json();
        expect(result).toMatchObject({ success: false, error: { code: "NOT_FOUND" } });
        expect(result.data).toBeUndefined();
      }
      const listed = await actor.request.get("/api/v1/messaging/conversations", {
        params: { organizationId: actor.organizationId },
      });
      expect((await listed.json()).data.map((item: { id: string }) => item.id)).not.toContain(
        conversation.id,
      );
    }
    const persisted = await owner.request.get("/api/v1/messaging/messages", {
      params: { organizationId: owner.organizationId, conversationId: conversation.id },
    });
    expect((await persisted.json()).data.map((item: { body: string }) => item.body)).toEqual([
      "Private root",
    ]);
    const context = await owner.request.post("/api/v1/context/message-page", {
      data: { organizationId: owner.organizationId, messageIds: [root.id] },
    });
    expect(context.status()).toBe(200);
    expect(await context.json()).toEqual({
      success: true,
      data: [{ messageId: root.id, links: [], people: [], messaging: [] }],
    });
  });
}
