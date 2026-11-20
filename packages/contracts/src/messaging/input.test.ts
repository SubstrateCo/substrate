import { editMessageInput, membersInput, messagingLimits, reactionListInput } from "./input.ts";
import { expect, test } from "bun:test";

const id = "00000000-0000-4000-8000-000000000001";

test("reaction pages list at most 50 reactors", () => {
  const page = (limit: string) =>
    reactionListInput.safeParse({ organizationId: "org", messageId: id, limit });
  expect(page("50").success).toBe(true);
  expect(page("51").success).toBe(false);
});

test("members can be added for at most the recipient limit at once", () => {
  const add = (count: number) =>
    membersInput.safeParse({
      organizationId: "org",
      conversationId: id,
      emails: Array(count).fill("person@example.test"),
    });
  expect(add(messagingLimits.recipients).success).toBe(true);
  expect(add(messagingLimits.recipients + 1).success).toBe(false);
});

test("edited message text stays within the body limit", () => {
  const edit = (length: number) =>
    editMessageInput.safeParse({ organizationId: "org", messageId: id, body: "x".repeat(length) });
  expect(edit(messagingLimits.body).success).toBe(true);
  expect(edit(messagingLimits.body + 1).success).toBe(false);
});
