import { describe, expect, test } from "bun:test";
import { messagingRead, messagingWrite } from "./messaging-contract";

describe("messaging request validation", () => {
  test("rejects empty messages and missing conversation IDs", () => {
    expect(
      messagingWrite.safeParse({ action: "send", conversationId: "a", body: "  " }).success,
    ).toBe(false);
    expect(messagingWrite.safeParse({ action: "send", body: "hello" }).success).toBe(false);
    expect(messagingRead.safeParse({ action: "messages" }).success).toBe(false);
  });

  test("bounds message and participant input", () => {
    expect(
      messagingWrite.safeParse({ action: "send", conversationId: "a", body: "x".repeat(20_001) })
        .success,
    ).toBe(false);
    expect(
      messagingWrite.safeParse({ action: "create", kind: "dm", emails: ["invalid"] }).success,
    ).toBe(false);
    expect(
      messagingWrite.safeParse({
        action: "create",
        kind: "group",
        emails: Array(31).fill("person@example.test"),
      }).success,
    ).toBe(false);
  });

  test("does not accept client-supplied actor scope", () => {
    const input = messagingWrite.parse({
      action: "send",
      conversationId: "a",
      body: " hello ",
      userId: "other",
      organizationId: "other",
    });
    expect(input).toEqual({ action: "send", conversationId: "a", body: "hello" });
  });
});
