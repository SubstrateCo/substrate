import { mcpTools } from "./index.ts";
import { expect, test } from "bun:test";

test("tools reject reversed windows and empty changes", () => {
  expect(
    mcpTools.read_conversation.input.safeParse({
      conversationId: crypto.randomUUID(),
      since: "2026-11-08T00:00:00Z",
      until: "2026-11-07T00:00:00Z",
    }).success,
  ).toBe(false);
  expect(
    mcpTools.update_task.input.safeParse({ taskId: crypto.randomUUID(), changes: {} }).success,
  ).toBe(false);
});
