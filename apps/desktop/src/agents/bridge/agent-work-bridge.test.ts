import type { AgentWorkRuntime } from "../runtime/runtime.ts";
import { dispatchAgentWork } from "./agent-work-bridge.ts";
import { expect, test } from "bun:test";
import { rejects } from "node:assert/strict";

test("the bridge rejects unknown methods and malformed IDs before the runtime sees them", async () => {
  const calls: string[] = [];
  const stop: AgentWorkRuntime["stop"] = async (turnId) => {
    calls.push(turnId);
  };
  const unexpected = () => {
    throw new Error("Unexpected runtime call.");
  };
  const runtime: Parameters<typeof dispatchAgentWork>[0] = {
    stop,
    conversation: unexpected,
    turn: unexpected,
    turnEvents: unexpected,
    agents: unexpected,
    agentActivity: unexpected,
    sendNow: unexpected,
    resendItem: unexpected,
    discardItem: unexpected,
    retry: unexpected,
    dismiss: unexpected,
    startFresh: unexpected,
    newTopic: unexpected,
    routines: {
      list: unexpected,
      create: unexpected,
      update: unexpected,
      approve: unexpected,
      delete: unexpected,
      tick: unexpected,
    },
  };
  await rejects(dispatchAgentWork(runtime, "execute", {}), Error);
  await rejects(dispatchAgentWork(runtime, "stop", "../../etc"), Error);
  const id = crypto.randomUUID();
  await dispatchAgentWork(runtime, "stop", id);
  expect(calls).toEqual([id]);
});
