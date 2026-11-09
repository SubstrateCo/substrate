import type { AgentWorkRuntime } from "../runtime/runtime.ts";
import { dispatchAgentWork } from "./agent-work-bridge.ts";
import { expect, test } from "bun:test";

test("the bridge rejects unknown methods and malformed IDs before the runtime sees them", async () => {
  const calls: string[] = [];
  const stop: AgentWorkRuntime["stop"] = async (turnId) => {
    calls.push(turnId);
  };
  // SAFETY: the dispatcher reaches only stop in this test.
  // oxlint-disable-next-line deslop/no-chained-type-assertions -- A partial runtime stands in for the real one.
  const runtime = { stop } as unknown as AgentWorkRuntime;
  // oxlint-disable-next-line typescript/await-thenable -- Bun rejection assertions are asynchronous despite their assertion return declarations.
  await expect(dispatchAgentWork(runtime, "execute", {})).rejects.toThrow();
  // oxlint-disable-next-line typescript/await-thenable -- Bun rejection assertions are asynchronous despite their assertion return declarations.
  await expect(dispatchAgentWork(runtime, "stop", "../../etc")).rejects.toThrow();
  const id = crypto.randomUUID();
  await dispatchAgentWork(runtime, "stop", id);
  expect(calls).toEqual([id]);
});

test("turn takes exactly one turn ID", async () => {
  const calls: string[] = [];
  const turn: AgentWorkRuntime["turn"] = async (turnId) => {
    calls.push(turnId);
    return null;
  };
  // SAFETY: the dispatcher reaches only turn in this test.
  // oxlint-disable-next-line deslop/no-chained-type-assertions -- A partial runtime stands in for the real one.
  const runtime = { turn } as unknown as AgentWorkRuntime;
  for (const value of [undefined, "not-a-uuid", [crypto.randomUUID()], { turnId: "x" }])
    // oxlint-disable-next-line typescript/await-thenable -- Bun rejection assertions are asynchronous despite their assertion return declarations.
    await expect(dispatchAgentWork(runtime, "turn", value)).rejects.toThrow();
  expect(calls).toEqual([]);
  const id = crypto.randomUUID();
  expect(await dispatchAgentWork(runtime, "turn", id)).toBeNull();
  expect(calls).toEqual([id]);
});
