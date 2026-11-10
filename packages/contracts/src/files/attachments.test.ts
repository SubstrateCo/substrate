import { messageInput } from "../messaging/input";
import { expect, test } from "bun:test";

const base = { organizationId: "org", conversationId: crypto.randomUUID(), body: "" };
test("messages need text or completed attachment IDs, with a bounded unique list", () => {
  expect(messageInput.safeParse(base).success).toBe(false);
  expect(
    messageInput.safeParse({ ...base, attachmentFileIds: [crypto.randomUUID()] }).success,
  ).toBe(true);
  const id = crypto.randomUUID();
  expect(messageInput.safeParse({ ...base, attachmentFileIds: [id, id] }).success).toBe(false);
  expect(
    messageInput.safeParse({
      ...base,
      attachmentFileIds: Array.from({ length: 11 }, () => crypto.randomUUID()),
    }).success,
  ).toBe(false);
});
