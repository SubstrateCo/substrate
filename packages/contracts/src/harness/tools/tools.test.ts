import { sessionKeys } from "../../agent-work/wakes.ts";
import { leaseTools, localToolCall, mcpCall, mcpTools } from "./index.ts";
import { expect, test } from "bun:test";

const turn = {
  turnId: crypto.randomUUID(),
  attempt: 1,
  sessionKey: sessionKeys.dm(crypto.randomUUID()),
  origin: { conversationId: crypto.randomUUID(), threadId: null },
  kind: "interactive",
};
const scope = { input: {}, organizationId: "org", agentId: crypto.randomUUID(), turn };

test("local tools never reach the server and server calls need a turn", () => {
  expect(mcpCall.safeParse({ ...scope, tool: "get_me" }).success).toBe(true);
  expect(mcpCall.safeParse({ ...scope, tool: "remember" }).success).toBe(false);
  expect(mcpCall.safeParse({ ...scope, tool: "get_me", turn: undefined }).success).toBe(false);
  expect(localToolCall.safeParse({ ...scope, tool: "remember", sessionId: "s" }).success).toBe(
    true,
  );
  expect(localToolCall.safeParse({ ...scope, tool: "get_me", sessionId: "s" }).success).toBe(false);
});

test("helpers can only report, and only helpers can report", () => {
  const main = leaseTools("main");
  const helper = leaseTools("helper");
  expect(main).not.toContain("finish_helper");
  expect(main).toContain("start_helper");
  expect(helper).toContain("finish_helper");
  for (const name of ["start_helper", "remember", "save_handoff", "reply", "propose"])
    expect(helper).not.toContain(name);
  expect(helper).toContain("read_thread");
});

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
