import { appOrigin } from "../test-support/environment";
import { test, type Actor } from "../test-support/fixtures";
import { expect } from "@playwright/test";

const origin = appOrigin;

type SetupInput =
  | Omit<z.input<typeof conversationInput>, "organizationId">
  | Omit<z.input<typeof messageInput>, "organizationId">
  | Omit<z.input<typeof leaveInput>, "organizationId">
  | Omit<z.input<typeof sharingAcceptInput>, "organizationId">
  | z.input<typeof notificationGroupReadInput>;

test("grouped notifications enforce recipient, workspace, current access, authentication, and mutation origin", async ({
  actors: { owner, recipient: sharedRecipient },
  workspace,
  request,
}) => {
  // A fresh recipient workspace, so its notification feed and unread state hold only this thread.
  const [recipient] = await workspace(sharedRecipient);
  const post = async (actor: Actor, path: string, data: SetupInput) => {
    const response = await actor.request.post(`/api/v1/${path}`, {
      headers: { origin },
      data: { organizationId: actor.organizationId, ...data },
    });
    expect(response.ok()).toBe(true);
    return (await response.json()).data;
  };
  const channel = await post(owner, "messaging/conversations", {
    kind: "channel",
    name: "Private launch",
    private: true,
    emails: [recipient.email],
    shareHistory: true,
  });
  const inbox = await recipient.request.get("/api/v1/messaging/sharing/inbox", {
    params: { organizationId: recipient.organizationId },
  });
  expect(inbox.ok()).toBe(true);
  const invitation = (await inbox.json()).data.find(
    (item: { conversationId: string }) => item.conversationId === channel.id,
  );
  await post(recipient, "messaging/sharing/accept", {
    invitationId: invitation.id,
    shareHistory: true,
  });
  const root = await post(recipient, "messaging/messages", {
    conversationId: channel.id,
    body: "Root",
  });
  await post(owner, "messaging/messages", {
    conversationId: channel.id,
    threadId: root.id,
    body: "First reply",
  });
  await post(owner, "messaging/messages", {
    conversationId: channel.id,
    threadId: root.id,
    body: "Second reply",
  });
  const query = { organizationId: recipient.organizationId };
  const page = await recipient.request.get("/api/v1/context/notifications/groups", {
    params: query,
  });
  expect(page.ok()).toBe(true);
  const group = (await page.json()).data.items[0];
  expect(group).toMatchObject({ count: 2, unreadCount: 2, groupKey: `thread:${root.id}` });
  const read = { ...query, groupKey: group.groupKey, through: group.newestCursor };
  expect(
    (await request.get("/api/v1/context/notifications/groups", { params: query })).status(),
  ).toBe(401);
  expect(
    (
      await recipient.request.get("/api/v1/context/notifications/groups", {
        params: { organizationId: owner.organizationId },
      })
    ).status(),
  ).toBe(403);
  const foreign = await owner.request.get("/api/v1/context/notifications/events", {
    params: { organizationId: owner.organizationId, groupKey: group.groupKey },
  });
  expect((await foreign.json()).data.items).toEqual([]);
  expect(
    (
      await owner.request.post("/api/v1/context/notifications/read-group", {
        headers: { origin },
        data: { ...read, organizationId: owner.organizationId },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await recipient.request.post("/api/v1/context/notifications/read-group", {
        headers: { origin: "https://untrusted.example" },
        data: read,
      })
    ).status(),
  ).toBe(403);
  const status = await recipient.request.get("/api/v1/context/notifications/unread", {
    params: query,
  });
  expect((await status.json()).data).toEqual({ unread: true });
  await post(recipient, "context/notifications/read-group", read);
  const after = await recipient.request.get("/api/v1/context/notifications/unread", {
    params: query,
  });
  expect((await after.json()).data).toEqual({ unread: false });
  await post(recipient, "messaging/conversations/leave", { conversationId: channel.id });
  for (const path of ["groups", "events"]) {
    const response = await recipient.request.get(`/api/v1/context/notifications/${path}`, {
      params: { ...query, groupKey: group.groupKey },
    });
    expect(response.ok()).toBe(true);
    expect((await response.json()).data.items).toEqual([]);
  }
  expect(
    (
      await recipient.request.post("/api/v1/context/notifications/read-group", {
        headers: { origin },
        data: read,
      })
    ).status(),
  ).toBe(404);
});
import type { notificationGroupReadInput } from "@substrate/contracts/context/notification-groups";
import type {
  conversationInput,
  messageInput,
  leaveInput,
} from "@substrate/contracts/messaging/input";
import type { sharingAcceptInput } from "@substrate/contracts/messaging/sharing";

import type { z } from "zod";
