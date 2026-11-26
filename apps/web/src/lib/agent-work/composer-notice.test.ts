import { noticeLines, noticeThread } from "./composer-notice";
import type { ConversationAgent } from "./conversation-agents";
import { conversationId, status, turn } from "./test-support";
import { expect, test } from "bun:test";

const member: ConversationAgent = { agentId: "agent", name: "Researcher", member: true };
const visitor: ConversationAgent = { ...member, member: false };
const base = {
  conversationId,
  threadId: null,
  agents: [member],
  turns: [],
  threadOf: () => null,
  statuses: undefined,
};
const kinds = (input: Partial<Parameters<typeof noticeLines>[0]>) =>
  noticeLines({ ...base, ...input }).map((line) => line.kind);
const published = (fields: Parameters<typeof status>[0]) => new Map([["agent", status(fields)]]);

test("a live or stopped turn shows in the place where it runs, before the agent's status", () => {
  const statuses = published({ state: "needs_you" });
  expect(kinds({ turns: [turn({ status: "running" })], statuses })).toEqual(["turn"]);
  expect(kinds({ turns: [turn({ status: "needs_attention" })], statuses })).toEqual(["turn"]);
  // The turn runs in the conversation, so the thread shows neither the turn nor the status.
  expect(kinds({ turns: [turn({ status: "running" })], statuses, threadId: "thread" })).toEqual([]);
  // A finished turn leaves the agent's status line.
  expect(kinds({ turns: [turn({ status: "completed" })], statuses })).toEqual(["needs_you"]);
});

test("a turn under its thread's root message shows in the conversation's composer", () => {
  // A mention in a channel starts a thread session rooted at the mention, which the channel shows.
  expect(noticeThread("root", "root")).toBeNull();
  // Work under a reply in the thread shows only in that thread.
  expect(noticeThread("root", "reply")).toBe("root");
  expect(noticeThread("root", undefined)).toBe("root");
  expect(noticeThread(null, "message")).toBeNull();
});

test("a turn shows for an agent that left the conversation", () => {
  expect(kinds({ agents: [visitor], turns: [turn({ status: "running" })] })).toEqual(["turn"]);
});

test("general lines show only in the conversation's own composer, for members", () => {
  expect(kinds({ statuses: published({ device: null }) })).toEqual(["no_desktop"]);
  expect(kinds({ statuses: published({ device: null }), threadId: "thread" })).toEqual([]);
  expect(kinds({ statuses: published({ state: "needs_you" }) })).toEqual(["needs_you"]);
  expect(kinds({ statuses: published({ state: "needs_you" }), agents: [visitor] })).toEqual([]);
  const offline = { id: "device", name: "MacBook", online: false };
  expect(kinds({ statuses: published({ state: "working", device: offline }) })).toEqual(["status"]);
  expect(kinds({ statuses: published({ state: "idle", device: offline }) })).toEqual([]);
});

test("an agent working here without a loaded turn shows its status in that place", () => {
  const statuses = published({
    state: "working",
    liveConversationId: conversationId,
    liveThreadId: "thread",
  });
  expect(kinds({ statuses, agents: [visitor], threadId: "thread" })).toEqual(["status"]);
  expect(kinds({ statuses, agents: [visitor] })).toEqual([]);
  expect(kinds({ statuses })).toEqual([]);
});
