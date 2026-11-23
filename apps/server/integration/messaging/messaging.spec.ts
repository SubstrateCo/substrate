import type { conversationInput, messageInput } from "@substrate/contracts/messaging/input";
import type { ServiceResult } from "@substrate/contracts/result";

import { appOrigin } from "../test-support/environment";
import { test, type Actor } from "../test-support/fixtures";
import { expect } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import type { z } from "zod";

const origin = appOrigin;

/** Letters only, so word search splits it the same way as the indexed text. */
const uniqueWord = () =>
  Array.from(randomBytes(12), (byte) => String.fromCharCode(97 + (byte % 26))).join("");

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

test("reaction lookup lists reactors only to participants of a private conversation", async ({
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
});

test("channel and thread references enforce target access through search, send and resolution", async ({
  actors: { owner, member, outsider },
}) => {
  // The shared workspace keeps earlier channels and threads, so the searched text is unique.
  const tag = uniqueWord();
  const targetName = `private-reference-target-${tag}`;
  const reply = `Searchable reply ${tag}`;
  const source = await post<{ id: string }>(owner, "conversations", {
    kind: "channel",
    name: "reference-source",
  });
  const target = await post<{ id: string }>(owner, "conversations", {
    kind: "channel",
    name: targetName,
    private: true,
  });
  const root = await post<{ id: string }>(owner, "messages", {
    conversationId: target.id,
    body: "Private reference thread",
  });
  await post(owner, "messages", {
    conversationId: target.id,
    threadId: root.id,
    body: reply,
  });
  const body = `See @[channel:${target.id}] and @[thread:${root.id}]`;
  const sent = await post<{ id: string }>(owner, "messages", { conversationId: source.id, body });
  for (const [actor, expectedIds] of [
    [owner, [target.id]],
    [member, []],
    [outsider, []],
  ] as const) {
    const search = await actor.request.post("/api/v1/context/search", {
      headers: { origin },
      data: {
        organizationId: actor.organizationId,
        kind: "channel",
        query: targetName,
      },
    });
    expect(search.ok()).toBe(true);
    expect((await search.json()).data.map((item: { id: string }) => item.id)).toEqual(expectedIds);
    const threads = await actor.request.post("/api/v1/context/search", {
      headers: { origin },
      data: { organizationId: actor.organizationId, kind: "thread", query: reply },
    });
    expect(threads.ok()).toBe(true);
    expect((await threads.json()).data.map((item: { id: string }) => item.id)).toEqual(
      actor === owner ? [root.id] : [],
    );
  }
  for (const actor of [owner, member]) {
    const page = await actor.request.post("/api/v1/context/message-page", {
      headers: { origin },
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
  actors,
  workspace,
}) => {
  // A fresh workspace, so the conversation list below is exactly what this test wrote.
  const [owner] = await workspace(actors.owner);
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
  actors: { owner: workspaceOwner, member: workspaceMember, outsider },
  workspace,
}) => {
  // A fresh workspace, so the managed and member lists below are exactly what this test wrote.
  const [owner, member] = await workspace(workspaceOwner, workspaceMember);
  const manage = (
    actor: Actor,
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
    actors: { owner: workspaceOwner, member: workspaceMember, outsider, recipient },
    workspace,
  }) => {
    // Creating a DM returns the workspace's existing DM between the same people, so a DM needs
    // a fresh workspace to hold only this test's messages.
    const [owner, member]: [Actor, Actor] =
      kind === "dm"
        ? await workspace(workspaceOwner, workspaceMember)
        : [workspaceOwner, workspaceMember];
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
          headers: { origin },
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
      headers: { origin },
      data: { organizationId: owner.organizationId, messageIds: [root.id] },
    });
    expect(context.status()).toBe(200);
    expect(await context.json()).toEqual({
      success: true,
      data: [{ messageId: root.id, links: [], people: [], messaging: [], agents: [] }],
    });
  });
}

const profile = (
  account: Actor,
  conversationId: string,
  actorId: string,
  organizationId?: string,
) =>
  account.request.get("/api/v1/messaging/profiles", {
    params: { organizationId: organizationId ?? account.organizationId, conversationId, actorId },
  });

test("profiles resolve only through visible conversations and keep contact details in the workspace", async ({
  actors: { owner, member, outsider },
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
