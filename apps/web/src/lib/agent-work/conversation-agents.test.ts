import { conversationAgents } from "./conversation-agents";
import { conversationId, request, status, turn } from "./test-support";
import { expect, test } from "bun:test";

const empty = { conversationId, members: [], turns: [], requests: [], statuses: [] };

test("an agent that left the conversation still shows its owner's work here", () => {
  const agents = conversationAgents({
    ...empty,
    turns: [turn({ userAgentId: "left" })],
    requests: [request({ userAgentId: "asked", agent: { actorId: "x", name: "Asker" } })],
    statuses: [
      status({ userAgentId: "left", agent: { actorId: "y", name: "Leaver" } }),
      status({ userAgentId: "live", liveConversationId: conversationId }),
      status({ userAgentId: "elsewhere", liveConversationId: "other" }),
    ],
  });
  expect(agents).toEqual([
    { agentId: "left", name: "Leaver", member: false },
    { agentId: "asked", name: "Asker", member: false },
    { agentId: "live", name: "Researcher", member: false },
  ]);
});

test("members show even without work, once each", () => {
  const agents = conversationAgents({
    ...empty,
    members: [{ agentId: "a1", name: "Writer" }],
    turns: [turn({ userAgentId: "a1" })],
  });
  expect(agents).toEqual([{ agentId: "a1", name: "Writer", member: true }]);
});

test("no members and no work shows no agents", () => {
  expect(conversationAgents(empty)).toEqual([]);
});
