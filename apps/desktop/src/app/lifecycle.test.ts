import { createLifecycle } from "./lifecycle.ts";
import { expect, test } from "bun:test";
import { rejects } from "node:assert/strict";

test("shutdown waits for work before sessions and worker, and shares concurrent calls", async () => {
  const gate = Promise.withResolvers<void>();
  const calls: string[] = [];
  const lifecycle = createLifecycle({
    stopAgentWork: async () => {
      calls.push("work");
      await gate.promise;
    },
    closeSessions: () => {
      calls.push("sessions");
    },
    disconnectRealtime: () => {
      calls.push("realtime");
    },
    disposeWorker: () => {
      calls.push("worker");
    },
  });
  const first = lifecycle.shutdown();
  const second = lifecycle.shutdown();
  expect(first).toBe(second);
  expect(calls).toEqual(["work"]);
  gate.resolve();
  await first;
  expect(calls).toEqual(["work", "sessions", "realtime", "worker"]);
});

test("shutdown still disposes the worker if session close fails", async () => {
  let disposed = false;
  const lifecycle = createLifecycle({
    stopAgentWork: () => {},
    closeSessions: () => {
      throw new Error("closed");
    },
    disconnectRealtime: () => {},
    disposeWorker: () => {
      disposed = true;
    },
  });
  await rejects(lifecycle.shutdown(), /closed/);
  expect(disposed).toBe(true);
});
