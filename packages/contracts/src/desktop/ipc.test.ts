import { exposeBridge, handleBridge } from "./ipc.ts";
import { describe, expect, test } from "bun:test";
import { z } from "zod";

describe("handleBridge", () => {
  test("rejects invalid input before running the implementation", async () => {
    let calls = 0;
    const run = handleBridge(
      "test",
      { set: { input: z.boolean() } },
      {
        set: () => {
          calls++;
        },
      },
    );
    // oxlint-disable-next-line typescript/await-thenable -- Bun's rejection assertion is asynchronous at runtime.
    await expect(run("set", "true")).rejects.toThrow();
    // oxlint-disable-next-line typescript/await-thenable -- Bun's rejection assertion is asynchronous at runtime.
    await expect(run("toString")).rejects.toThrow("Invalid bridge operation.");
    expect(calls).toBe(0);
    await run("set", true);
    expect(calls).toBe(1);
  });
});

test("preload methods route grouped and multi-argument calls through the same contract", async () => {
  const methods = {
    "routines.create": { input: z.object({ name: z.string() }), output: z.string() },
    events: { input: z.tuple([z.string(), z.number().optional()]), output: z.array(z.string()) },
  };
  const dispatch = handleBridge("test", methods, {
    "routines.create": (input) => input.name,
    events: ([id, after]) => [`${id}:${after ?? 0}`],
  });
  const api = exposeBridge("test", methods, async (channel, method, value) => {
    expect(channel).toBe("test");
    return dispatch(method, value);
  });
  expect(await api.routines.create({ name: "daily" })).toBe("daily");
  expect(await api.events("turn", 3)).toEqual(["turn:3"]);
});
