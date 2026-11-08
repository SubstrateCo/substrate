import { mcpTools } from "./tools";
import { expect, test } from "bun:test";

test("tools reject acting identity, unbounded pages, reversed windows and empty changes", () => {
  const conversationId = crypto.randomUUID();
  expect(
    mcpTools.send_message.input.safeParse({
      requestId: crypto.randomUUID(),
      conversationId,
      body: "hello",
      actorId: crypto.randomUUID(),
    }).success,
  ).toBe(false);
  expect(mcpTools.list_messages.input.safeParse({ conversationId, limit: 101 }).success).toBe(
    false,
  );
  expect(
    mcpTools.list_messages.input.safeParse({
      conversationId,
      since: "2026-11-08T00:00:00Z",
      until: "2026-11-07T00:00:00Z",
    }).success,
  ).toBe(false);
  expect(
    mcpTools.update_task.input.safeParse({ taskId: crypto.randomUUID(), changes: {} }).success,
  ).toBe(false);
});
