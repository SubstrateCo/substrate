import { realtimeKeys, type RealtimeHint } from "@startup-os/contracts/realtime";

import { toolHints } from "./hints";
import { expect, test } from "bun:test";

const scope = { organizationId: "org", userId: "owner" };
const tasks: RealtimeHint = { audience: realtimeKeys.organization("org"), domain: "tasks" };
const context: RealtimeHint = { audience: realtimeKeys.organization("org"), domain: "context" };
const agentWork: RealtimeHint = { audience: realtimeKeys.user("owner"), domain: "agent-work" };
const notified = (actor: string): RealtimeHint => ({
  audience: realtimeKeys.actor("org", actor),
  domain: "notifications",
});
const message: RealtimeHint = {
  audience: realtimeKeys.conversation("c1"),
  domain: "messaging",
  scope: "messages",
};
const id = crypto.randomUUID();

test("task writes refresh tasks, a sourced task also refreshes context, and assignees are notified", () => {
  const create = { title: "Ship", projectId: id, requestId: id };
  expect(toolHints({ tool: "create_task", input: create, hints: [] }, scope)).toEqual([tasks]);
  expect(
    toolHints(
      {
        tool: "create_task",
        input: { ...create, sourceMessageId: id, assigneeActorId: "bob" },
        hints: [],
      },
      scope,
    ),
  ).toEqual([tasks, context, notified("bob")]);
  expect(
    toolHints(
      {
        tool: "update_task",
        input: { taskId: id, requestId: id, changes: { assigneeActorId: "bob" } },
        hints: [],
      },
      scope,
    ),
  ).toEqual([tasks, notified("bob")]);
  expect(
    toolHints(
      { tool: "update_task", input: { taskId: id, requestId: id, changes: {} }, hints: [] },
      scope,
    ),
  ).toEqual([tasks]);
  expect(
    toolHints(
      { tool: "add_task_comment", input: { taskId: id, body: "Hi", requestId: id }, hints: [] },
      scope,
    ),
  ).toEqual([tasks]);
});

test("replies send their message hints and the owner's agent-work refresh, not task or context", () => {
  expect(
    toolHints({ tool: "reply", input: { body: "Done", requestId: id }, hints: [message] }, scope),
  ).toEqual([message, agentWork]);
  expect(
    toolHints(
      {
        tool: "propose",
        input: {
          summary: "Post",
          requestId: id,
          action: { type: "reply_elsewhere", input: { conversationId: id, body: "Hi" } },
        },
        hints: [],
      },
      scope,
    ),
  ).toEqual([agentWork]);
});

test("link writes refresh context only, and reads refresh nothing", () => {
  const target = { messageId: id, target: { type: "task" as const, id } };
  expect(toolHints({ tool: "attach_message", input: target, hints: [] }, scope)).toEqual([context]);
  expect(toolHints({ tool: "detach_message", input: target, hints: [] }, scope)).toEqual([context]);
  expect(toolHints({ tool: "get_task", input: { taskId: id }, hints: [] }, scope)).toEqual([]);
});
