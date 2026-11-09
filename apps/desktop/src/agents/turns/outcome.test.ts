import type { NewOutput } from "@startup-os/client-storage/agent-work";

import { turnOutcome } from "./outcome.ts";
import { toolOutputs } from "./tool-results.ts";
import { expect, test } from "bun:test";

test("a turn without outputs is silent", () => {
  expect(turnOutcome([])).toBe("silent");
});

test("a question wins over the reply that carried it, and a proposal over a plain reply", () => {
  expect(
    turnOutcome([
      { targetKind: "message", requestKind: null },
      { targetKind: "request", requestKind: "question" },
    ]),
  ).toBe("asked");
  expect(
    turnOutcome([
      { targetKind: "message", requestKind: null },
      { targetKind: "request", requestKind: "proposal" },
    ]),
  ).toBe("proposed");
  expect(turnOutcome([{ targetKind: "message", requestKind: null }])).toBe("replied");
});

const ids = {
  turn: "00000000-0000-4000-8000-000000000001",
  message: "00000000-0000-4000-8000-000000000002",
  conversation: "00000000-0000-4000-8000-000000000003",
  thread: "00000000-0000-4000-8000-000000000004",
  question: "00000000-0000-4000-8000-000000000005",
  proposal: "00000000-0000-4000-8000-000000000006",
  task: "00000000-0000-4000-8000-000000000007",
  project: "00000000-0000-4000-8000-000000000008",
};
const createdAt = "2026-11-09T10:00:00.000Z";
const call = (tool: string) => ({
  tool,
  input: { requestId: ids.turn, body: "Which one?" },
  turn: { turnId: ids.turn },
});
const outcomeOf = (outputs: NewOutput[]) =>
  turnOutcome(
    outputs.map((output) => ({
      targetKind: output.kind,
      requestKind: output.kind === "request" ? output.requestKind : null,
    })),
  );

test("a server reply with ask records the message in its place and the question", () => {
  const found = toolOutputs(call("reply"), {
    success: true,
    data: {
      messageId: ids.message,
      conversationId: ids.conversation,
      threadId: ids.thread,
      questionId: ids.question,
      createdAt,
    },
  });
  expect(found).toEqual({
    turnId: ids.turn,
    outputs: [
      { kind: "message", id: ids.message, conversationId: ids.conversation, threadId: ids.thread },
      { kind: "request", id: ids.question, requestKind: "question" },
    ],
  });
  expect(outcomeOf(found!.outputs)).toBe("asked");
});

test("a server propose result records the proposal request", () => {
  const found = toolOutputs(call("propose"), {
    success: true,
    data: { proposalId: ids.proposal, status: "pending" },
  });
  expect(found).toEqual({
    turnId: ids.turn,
    outputs: [{ kind: "request", id: ids.proposal, requestKind: "proposal" }],
  });
  expect(outcomeOf(found!.outputs)).toBe("proposed");
});

test("created and updated tasks are task outputs", () => {
  const task = {
    id: ids.task,
    title: "Ship it",
    description: "",
    status: "not_started",
    priority: "none",
    assignee: null,
    dueDate: null,
    project: { id: ids.project, name: "Launch" },
    parent: null,
    subtaskCount: 0,
    source: null,
    commentCount: 0,
    linkedMessageCount: 0,
    createdAt,
    updatedAt: createdAt,
  };
  for (const tool of ["create_task", "update_task"])
    expect(toolOutputs(call(tool), { success: true, data: task })?.outputs).toEqual([
      { kind: "task", id: ids.task },
    ]);
});

test("failed calls, read tools and unknown result shapes produce nothing", () => {
  expect(
    toolOutputs(call("reply"), { success: false, error: { code: "X", message: "x" } }),
  ).toBeNull();
  expect(
    toolOutputs(call("search"), { success: true, data: { messageId: ids.message } }),
  ).toBeNull();
  // The old desktop-only shape: no place and no question ID field the server sends.
  expect(
    toolOutputs(call("reply"), {
      success: true,
      data: { messageId: ids.message, requestId: ids.question },
    }),
  ).toBeNull();
});
