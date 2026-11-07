import type { conversationInput, messageInput } from "@startup-os/contracts/messaging/input";
import type { ServiceResult } from "@startup-os/contracts/result";

import { provisionVerifiedAccount } from "../../web/e2e/test-support/auth";
import { Mailpit } from "../../web/e2e/test-support/mailpit";
import { provisionWorkspaceSession } from "../../web/e2e/test-support/organizations";
import { expect, test as base, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import type { z } from "zod";

const origin = new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").origin;
type Actor = { request: APIRequestContext; organizationId: string; email: string };

const test = base.extend<{
  actors: { owner: Actor; member: Actor; outsider: Actor; recipient: Actor };
}>({
  actors: async ({ playwright }, use) => {
    const contexts: APIRequestContext[] = [];
    const account = async (kind: string): Promise<Actor> => {
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

async function post<T>(actor: Actor, endpoint: "conversations" | "messages", input: Mutation) {
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
    });
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
      data: [{ messageId: root.id, links: [], people: [] }],
    });
  });
}
