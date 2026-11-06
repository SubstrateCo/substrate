import { failure } from "@startup-os/contracts/result";

import { createMessagingRoutes } from "./routes";
import * as services from "./service";
import { expect, mock, test } from "bun:test";

const conversationId = "00000000-0000-4000-8000-000000000001";

test("messaging validates each route before calling services", async () => {
  const spies = {
    listConversations: mock(services.listConversations),
    createConversation: mock(services.createConversation),
    listMessages: mock(services.listMessages),
    sendMessage: mock(services.sendMessage),
    toggleReaction: mock(services.toggleReaction),
    addMembers: mock(services.addMembers),
  };
  const app = createMessagingRoutes(spies);
  for (const [method, path, body] of [
    ["GET", "/conversations", undefined],
    ["GET", "/messages?organizationId=org", undefined],
    ["POST", "/conversations", { organizationId: "org", kind: "dm", emails: ["invalid"] }],
    ["POST", "/messages", { organizationId: "org", conversationId, body: " " }],
    ["POST", "/reactions", { organizationId: "org", messageId: conversationId, emoji: "" }],
    [
      "POST",
      "/members",
      { organizationId: "org", conversationId, emails: Array(31).fill("person@example.test") },
    ],
  ] as const) {
    const response = await app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(failure("INVALID_INPUT", "Invalid request input."));
  }
  for (const spy of Object.values(spies)) expect(spy).not.toHaveBeenCalled();
});

test("messaging forwards only validated input and maps domain errors", async () => {
  const sendMessage = mock(async () => failure("CONFLICT", "Message request already used."));
  const app = createMessagingRoutes({ ...services, sendMessage });
  const response = await app.request("/messages", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      organizationId: "org",
      conversationId,
      body: " hello ",
      userId: "other",
      actorEntityId: conversationId,
    }),
  });
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual(failure("CONFLICT", "Message request already used."));
  expect(sendMessage).toHaveBeenCalledWith(expect.any(Headers), {
    organizationId: "org",
    conversationId,
    body: "hello",
  });
});
