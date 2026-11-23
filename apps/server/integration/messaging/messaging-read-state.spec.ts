import { appOrigin } from "../test-support/environment";
import { test } from "../test-support/fixtures";
import { expect } from "@playwright/test";

test("conversation read positions are persistent, monotonic, and scoped to the reader's access", async ({
  actors,
  workspace,
  request,
}) => {
  const [owner, member] = await workspace(actors.owner, actors.member);
  const organizationId = owner.organizationId;
  const conversationResponse = await owner.request.post("/api/v1/messaging/conversations", {
    headers: { origin: appOrigin },
    data: {
      organizationId,
      kind: "channel",
      name: "Read positions",
      private: true,
      emails: [member.email],
    },
  });
  expect(conversationResponse.ok()).toBe(true);
  const conversationId: string = (await conversationResponse.json()).data.id;
  const send = async (body: string) => {
    const response = await owner.request.post("/api/v1/messaging/messages", {
      headers: { origin: appOrigin },
      data: { organizationId, conversationId, body },
    });
    expect(response.ok()).toBe(true);
    const result: { data: { id: string } } = await response.json();
    return result.data.id;
  };
  const first = await send("first");
  const last = await send("last");
  const counts = async () => {
    const response = await member.request.get("/api/v1/messaging/unread", {
      params: { organizationId },
    });
    expect(response.ok()).toBe(true);
    return (await response.json()).data;
  };
  expect(await counts()).toEqual([
    { conversationId, unreadCount: 2, mentionCount: 0, firstUnreadMessageId: first },
  ]);
  for (const messageId of [last, first]) {
    const response = await member.request.post("/api/v1/messaging/read", {
      headers: { origin: appOrigin },
      data: { organizationId, conversationId, messageId },
    });
    expect(response.ok()).toBe(true);
  }
  expect(await counts()).toEqual([]);
  const next = await send("new unread");
  expect(await counts()).toEqual([
    { conversationId, unreadCount: 1, mentionCount: 0, firstUnreadMessageId: next },
  ]);
  expect(
    (await request.get("/api/v1/messaging/unread", { params: { organizationId } })).status(),
  ).toBe(401);
  expect(
    (
      await actors.outsider.request.get("/api/v1/messaging/unread", { params: { organizationId } })
    ).status(),
  ).toBe(403);
  expect(
    (
      await member.request.post("/api/v1/messaging/read", {
        headers: { origin: "https://untrusted.example" },
        data: { organizationId, conversationId, messageId: last },
      })
    ).status(),
  ).toBe(403);
  const left = await member.request.post("/api/v1/messaging/conversations/leave", {
    headers: { origin: appOrigin },
    data: { organizationId, conversationId },
  });
  expect(left.ok()).toBe(true);
  expect(await counts()).toEqual([]);
  expect(
    (
      await member.request.post("/api/v1/messaging/read", {
        headers: { origin: appOrigin },
        data: { organizationId, conversationId, messageId: last },
      })
    ).status(),
  ).toBe(404);
});
