import type {
  conversationInput,
  editMessageInput,
  messageInput,
  messageTargetInput,
  removeMemberInput,
} from "@substrate/contracts/messaging/input";
import type { ServiceResult } from "@substrate/contracts/result";

import { appOrigin } from "../test-support/environment";
import { test, type Actor } from "../test-support/fixtures";
import { expect } from "@playwright/test";
import type { z } from "zod";

type Mutation =
  | Omit<z.input<typeof conversationInput>, "organizationId">
  | Omit<z.input<typeof messageInput>, "organizationId">
  | Omit<z.input<typeof editMessageInput>, "organizationId">
  | Omit<z.input<typeof messageTargetInput>, "organizationId">
  | Omit<z.input<typeof removeMemberInput>, "organizationId">;

const write = (actor: Actor, endpoint: string, input: Mutation, origin = appOrigin) =>
  actor.request.post(`/api/v1/messaging/${endpoint}`, {
    headers: { origin },
    data: { organizationId: actor.organizationId, ...input },
  });

async function create(actor: Actor, endpoint: string, input: Mutation) {
  const response = await write(actor, endpoint, input);
  expect(response.ok()).toBe(true);
  const result: ServiceResult<{ id: string }> = await response.json();
  if (!result.success) throw new Error(result.error.message);
  return result.data;
}

test("edit/delete enforce author and organization boundaries, and tombstones preserve thread navigation", async ({
  actors: { owner, member, outsider },
}) => {
  const channel = await create(owner, "conversations", {
    kind: "channel",
    name: "message-lifecycle",
  });
  const requestId = crypto.randomUUID();
  const root = await create(member, "messages", {
    conversationId: channel.id,
    body: "Original private draft",
    requestId,
  });
  const reply = await create(owner, "messages", {
    conversationId: channel.id,
    body: "Reply remains",
    threadId: root.id,
  });
  for (const actor of [owner, outsider]) {
    expect(
      (await write(actor, "messages/edit", { messageId: root.id, body: "forbidden" })).status(),
    ).toBe(404);
    expect((await write(actor, "messages/delete", { messageId: root.id })).status()).toBe(404);
  }
  for (const endpoint of ["messages/edit", "messages/delete"])
    expect(
      (
        await write(
          member,
          endpoint,
          { messageId: root.id, body: "no origin bypass" },
          "https://foreign.example.test",
        )
      ).status(),
    ).toBe(403);
  expect(
    (await write(member, "messages/edit", { messageId: root.id, body: "Revised draft" })).ok(),
  ).toBe(true);
  expect(
    (
      await write(member, "messages", {
        conversationId: channel.id,
        body: "Original private draft",
        requestId,
      })
    ).status(),
  ).toBe(409);
  expect((await write(member, "messages/delete", { messageId: root.id })).ok()).toBe(true);
  expect(
    (
      await write(member, "messages", {
        conversationId: channel.id,
        body: "Original private draft",
        requestId,
      })
    ).status(),
  ).toBe(409);
  const messages = await member.request.get("/api/v1/messaging/messages", {
    params: { organizationId: member.organizationId, conversationId: channel.id },
  });
  expect(
    (await messages.json()).data.find((item: { id: string }) => item.id === root.id),
  ).toMatchObject({
    body: "",
    attachments: [],
    canModify: false,
    deletedAt: expect.any(String),
    replyCount: 1,
  });
  const thread = await member.request.get("/api/v1/messaging/messages", {
    params: {
      organizationId: member.organizationId,
      conversationId: channel.id,
      threadId: root.id,
    },
  });
  expect((await thread.json()).data.map((item: { id: string }) => item.id)).toEqual([reply.id]);
});

test("internal member removal revokes private access but not public read access", async ({
  actors: { owner, member, outsider },
}) => {
  for (const privateChannel of [true, false]) {
    const channel = await create(owner, "conversations", {
      kind: "channel",
      private: privateChannel,
      name: `removal-${crypto.randomUUID()}`,
      emails: [member.email],
    });
    const sent = await create(member, "messages", {
      conversationId: channel.id,
      body: "Member history remains",
    });
    const conversations = await owner.request.get("/api/v1/messaging/conversations", {
      params: { organizationId: owner.organizationId },
    });
    const listed = (await conversations.json()).data.find(
      (item: { id: string }) => item.id === channel.id,
    );
    const target = listed.members.find((item: { name: string }) => item.name === member.name);
    const host = listed.members.find((item: { name: string }) => item.name === owner.name);
    expect(
      (
        await write(member, "members/remove", { conversationId: channel.id, actorId: host.actorId })
      ).status(),
    ).toBe(404);
    expect(
      (
        await write(owner, "members/remove", { conversationId: channel.id, actorId: host.actorId })
      ).status(),
    ).toBe(404);
    expect(
      (
        await write(outsider, "members/remove", {
          conversationId: channel.id,
          actorId: target.actorId,
        })
      ).status(),
    ).toBe(404);
    const removed = await write(owner, "members/remove", {
      conversationId: channel.id,
      actorId: target.actorId,
    });
    expect(removed.ok()).toBe(true);
    expect((await removed.json()).data).toEqual({ removed: true, accessRevoked: privateChannel });
    const messages = await member.request.get("/api/v1/messaging/messages", {
      params: { organizationId: member.organizationId, conversationId: channel.id },
    });
    expect(messages.status()).toBe(privateChannel ? 404 : 200);
    if (privateChannel) {
      expect(
        (
          await write(member, "messages/edit", { messageId: sent.id, body: "lost access" })
        ).status(),
      ).toBe(404);
      expect((await write(member, "messages/delete", { messageId: sent.id })).status()).toBe(404);
    } else {
      expect((await messages.json()).data[0].body).toBe("Member history remains");
    }
  }
});
