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
  };
  const items = needsYouItems(data);
  expect(items.requests.map((entry) => entry.id)).toEqual(["r1", "r2"]);
  expect(items.agents.map((entry) => entry.userAgentId)).toEqual(["a2"]);
  expect(needsYouCount(data)).toBe(3);
});

test("nothing loaded counts as nothing", () => {
  expect(needsYouCount(undefined)).toBe(0);
});
