import type { AgentInvocationView } from "@substrate/contracts/agent-work";

import { needsYouCount, needsYouItems } from "./needs-you";
import { request, status } from "./test-support";
import { expect, test } from "bun:test";

const stopped = (agentId: string) =>
  status({ userAgentId: agentId, state: "needs_you", agent: { actorId: agentId, name: agentId } });

test("an agent with a request counts once, for the request", () => {
  const data = {
    requests: [request({ id: "r1", userAgentId: "a1" }), request({ id: "r2", userAgentId: "a1" })],
    agents: [stopped("a1"), stopped("a2")],
    calls: [],
    desktopUpdateRequired: [],
  };
  const items = needsYouItems(data);
  expect(items.requests.map((entry) => entry.id)).toEqual(["r1", "r2"]);
  expect(items.agents.map((entry) => entry.userAgentId)).toEqual(["a2"]);
  expect(needsYouCount(data)).toBe(3);
});

test("nothing loaded counts as nothing", () => {
  expect(needsYouCount(undefined)).toBe(0);
  expect(needsYouItems(undefined).desktopUpdateRequired).toEqual([]);
});

test("desktop updates count as attention even with open requests for the same agent", () => {
  const update = {
    userAgentId: "a1",
    agent: { actorId: "a1", name: "Scout" },
    droppedCalls: 3,
    lastDroppedAt: "2026-11-11T10:00:00Z",
  };
  const data = {
    requests: [request({ userAgentId: "a1" })],
    agents: [stopped("a1")],
    calls: [],
    desktopUpdateRequired: [update],
  };
  expect(needsYouItems(data).desktopUpdateRequired).toEqual([update]);
  expect(needsYouCount(data)).toBe(2);
});

test("a desktop update counts once per agent, not once per dropped call", () => {
  const data = {
    requests: [],
    agents: [],
    calls: [],
    desktopUpdateRequired: [
      {
        userAgentId: "a1",
        agent: { actorId: "a1", name: "Scout" },
        droppedCalls: 5,
        lastDroppedAt: "2026-11-11T10:00:00Z",
      },
    ],
  };
  expect(needsYouCount(data)).toBe(1);
});

test("calls notify even when the same agent already has a request", () => {
  const call: AgentInvocationView = {
    id: "call",
    userAgentId: "a1",
    agent: { actorId: "a1", name: "Scout" },
    caller: { actorId: "caller", name: "Caller" },
    kind: "mention",
    status: "pending_approval",
    dropReason: null,
    policy: "ask",
    allowlisted: false,
    place: { access: "hidden" },
    preview: null,
    createdAt: "2026-11-11T10:00:00Z",
    decidedAt: null,
    expiresAt: "2026-11-12T10:00:00Z",
  };
  const data = {
    requests: [request({ userAgentId: "a1" })],
    agents: [stopped("a1")],
    calls: [call],
    desktopUpdateRequired: [],
  };
  expect(needsYouCount(data)).toBe(2);
  expect(needsYouItems(data).calls).toEqual([call]);
});
