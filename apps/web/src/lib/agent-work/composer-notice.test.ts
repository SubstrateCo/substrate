import { noticeLines } from "./composer-notice";
import type { ConversationAgent } from "./conversation-agents";
import { conversationId, status, turn } from "./test-support";
import { expect, test } from "bun:test";

const member: ConversationAgent = { agentId: "agent", name: "Researcher", member: true };
const visitor: ConversationAgent = { ...member, member: false };
const base = {
  conversationId,
  threadId: null,
  agents: [member],
  homed: new Map<string, unknown>(),
  turns: [],
  threadOf: () => null,
  statuses: undefined,
};
const kinds = (input: Partial<Parameters<typeof noticeLines>[0]>) =>
  noticeLines({ ...base, ...input }).map((line) => line.kind);
const published = (fields: Parameters<typeof status>[0]) => new Map([["agent", status(fields)]]);

test("an agent homed here shows only its live turn in the place where it runs", () => {
  const live = turn({ status: "running" });
  const homed = new Map([["agent", {}]]);
  const statuses = published({ state: "needs_you" });
  expect(kinds({ homed, turns: [live], statuses })).toEqual(["turn"]);
  // The turn runs in the conversation, so the thread shows nothing, not the published status.
  expect(kinds({ homed, turns: [live], statuses, threadId: "thread" })).toEqual([]);
  expect(kinds({ homed, turns: [turn({ status: "completed" })], statuses })).toEqual([]);
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

test("an agent working here shows its status in that place, member or not", () => {
  const statuses = published({
    state: "working",
    liveConversationId: conversationId,
    liveThreadId: "thread",
  });
  expect(kinds({ statuses, agents: [visitor], threadId: "thread" })).toEqual(["status"]);
  expect(kinds({ statuses, agents: [visitor] })).toEqual([]);
  expect(kinds({ statuses })).toEqual([]);
});
