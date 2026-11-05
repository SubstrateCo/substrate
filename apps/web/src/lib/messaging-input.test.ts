import { expect, test } from "bun:test";
import { conversationInput, messageInput, messageListInput } from "./messaging-input";

const conversationId = "be350e0e-468b-4147-bd81-1d5af50ad394";

test("server inputs reject malformed conversation and thread identifiers", () => {
  expect(
    messageListInput.safeParse({ organizationId: "team", conversationId: "invalid" }).success,
  ).toBe(false);
  expect(
    messageListInput.safeParse({ organizationId: "team", conversationId, threadId: "invalid" })
      .success,
  ).toBe(false);
});

test("server inputs require workspace consistency and nonempty message content", () => {
  expect(messageInput.safeParse({ conversationId, body: "hello" }).success).toBe(false);
  expect(
    messageInput.safeParse({ organizationId: "team", conversationId, body: "   " }).success,
  ).toBe(false);
  expect(
    messageInput.parse({
      organizationId: "team",
      conversationId,
      body: " hello ",
      authorId: "forged",
    }),
  ).toEqual({ organizationId: "team", conversationId, body: "hello" });
});

test("server inputs reject invalid recipients and oversized channel names", () => {
  expect(
    conversationInput.safeParse({ organizationId: "team", kind: "dm", emails: ["not-an-email"] })
      .success,
  ).toBe(false);
  expect(
    conversationInput.safeParse({ organizationId: "team", kind: "channel", name: "x".repeat(81) })
      .success,
  ).toBe(false);
});
