import { dispatchAgentWork } from "./agent-work-bridge.ts";
import { expect, test } from "bun:test";
import { rejects } from "node:assert/strict";

test("the bridge rejects unknown methods and malformed IDs before the runtime sees them", async () => {
  const calls: string[] = [];
  const unexpected = () => {
    throw new Error("Unexpected runtime call.");
  };
  const runtime: Parameters<typeof dispatchAgentWork>[0] = {
    turnRuns: async (turnId) => {
      calls.push(turnId);
      return [];
    },
    turnEvents: unexpected,
    homedAgents: unexpected,
  };
  // Commands moved to the server: the bridge no longer has them.
  await rejects(dispatchAgentWork(runtime, "stop", crypto.randomUUID()), Error);
  await rejects(dispatchAgentWork(runtime, "turnRuns", "../../etc"), Error);
  const id = crypto.randomUUID();
  await dispatchAgentWork(runtime, "turnRuns", id);
  expect(calls).toEqual([id]);
});
