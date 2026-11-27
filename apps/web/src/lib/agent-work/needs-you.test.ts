import { needsYouCount, needsYouItems } from "@substrate/contracts/agent-work/needs-you";

import { attentionTurn, request, status, uncertainItem } from "./test-support";
import { expect, test } from "bun:test";

const stopped = (agentId: string) =>
  status({ userAgentId: agentId, state: "needs_you", agent: { actorId: agentId, name: agentId } });
const empty = { requests: [], agents: [], turns: [], items: [] };

test("an agent with a request counts once, for the request", () => {
  const data = {
    ...empty,
    requests: [request({ id: "r1", userAgentId: "a1" }), request({ id: "r2", userAgentId: "a1" })],
    agents: [stopped("a1"), stopped("a2")],
  };
  const items = needsYouItems(data);
  expect(items.requests.map((entry) => entry.id)).toEqual(["r1", "r2"]);
  expect(items.agents.map((entry) => entry.userAgentId)).toEqual(["a2"]);
  expect(needsYouCount(data)).toBe(3);
});

test("a stopped turn explains its agent and holds its own uncertain items", () => {
  const data = {
    ...empty,
    agents: [stopped("a1")],
    turns: [attentionTurn({ id: "t1", userAgentId: "a1" })],
    items: [
      uncertainItem({ id: "mine", userAgentId: "a1", turnId: "t1" }),
      uncertainItem({ id: "loose", userAgentId: "a2", turnId: "t9" }),
    ],
  };
  const items = needsYouItems(data);
  expect(items.turns.map((turn) => [turn.id, turn.uncertainItemIds])).toEqual([["t1", ["mine"]]]);
  expect(items.items.map((item) => item.id)).toEqual(["loose"]);
  expect(items.agents).toEqual([]);
  expect(needsYouCount(data)).toBe(2);
});

test("nothing loaded counts as nothing", () => {
  expect(needsYouCount(undefined)).toBe(0);
});
