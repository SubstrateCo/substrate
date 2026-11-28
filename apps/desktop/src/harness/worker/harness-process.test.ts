import type { IpcValue } from "@substrate/contracts/desktop/ipc";
import type { HarnessEvent } from "@substrate/contracts/harness-runtime";
import { advanceTimersAsync } from "@substrate/contracts/testing/timers";

import { createHarnessProcess } from "./harness-process.ts";
import { afterEach, expect, test, vi } from "bun:test";
import { rejects } from "node:assert/strict";
import { EventEmitter } from "node:events";

type Sent = { id: number; method: string; value?: unknown };

class FakeChild extends EventEmitter {
  readonly sent: Sent[] = [];
  private waiters: { method: string; resolve: (message: Sent) => void }[] = [];
  killed = false;
  postMessage(message: Sent) {
    this.sent.push(message);
    for (const waiter of this.waiters.filter((entry) => entry.method === message.method)) {
      this.waiters.splice(this.waiters.indexOf(waiter), 1);
      waiter.resolve(message);
    }
  }
  posted(method: string) {
    const message = Promise.withResolvers<Sent>();
    this.waiters.push({ method, resolve: message.resolve });
    return message.promise;
  }
  kill() {
    if (this.killed) return;
    this.killed = true;
    this.emit("exit", 1);
  }
  answer(method: string, result?: IpcValue) {
    const request = this.sent.filter((entry) => entry.method === method).at(-1);
    this.emit("message", { id: request!.id, result });
  }
}

const turnId = "0d6f4c3e-8b4f-4c39-9d7e-3f1c2a5b6e71";

afterEach(() => {
  vi.useRealTimers();
});

function open(sessionId: string) {
  return {
    type: "open" as const,
    organizationId: "org-1",
    sessionId,
    agentId: "agent-1",
    folder: "main" as const,
    epoch: 0,
    prefix: "",
    mcpServers: [],
  };
}

function event(sessionId: string, body: Partial<HarnessEvent>): HarnessEvent {
  // SAFETY: tests build only the event fields the process reads.
  return {
    sessionId,
    organizationId: "org-1",
    turnId: null,
    generation: null,
    timestamp: 1,
    ...body,
  } as HarnessEvent;
}

async function started(timeouts?: { commandMs?: number; requestMs?: number }) {
  const events: HarnessEvent[] = [];
  const child = new FakeChild();
  const worker = createHarnessProcess(
    { fork: () => child },
    "entry",
    "account",
    (entry) => events.push(entry),
    async () => ({ success: true, data: {} }),
    async () => ({ success: true, data: {} }),
    timeouts,
  );
  child.answer("initialize");
  const current = child;
  async function openSession(sessionId: string) {
    const sent = current.posted("execute");
    const pending = worker.request("execute", open(sessionId));
    await sent;
    current.answer("execute", { id: sessionId });
    await pending;
  }
  return { worker, events, child: current, openSession };
}

function closed(events: HarnessEvent[]) {
  return events.flatMap((entry) =>
    entry.type === "session.closed"
      ? [[entry.sessionId, entry.reason, entry.turnId, entry.generation]]
      : [],
  );
}

test("worker exit closes every open session with its live turn", async () => {
  const f = await started();
  await f.openSession("session-1");
  await f.openSession("session-2");
  await f.openSession("session-3");
  f.child.emit("message", {
    event: event("session-2", { type: "turn.started", turnId, generation: 3 }),
  });
  f.child.emit("message", {
    event: event("session-3", { type: "session.closed", reason: "idle" }),
  });
  const sent = f.child.posted("execute");
  const pending = f.worker.request("execute", open("session-4"));
  await sent;
  f.child.emit("exit", 1);
  await rejects(pending, { code: "worker-stopped" });
  expect(closed(f.events)).toEqual([
    ["session-3", "idle", null, null],
    ["session-1", "worker_exited", null, null],
    ["session-2", "worker_exited", turnId, 3],
    ["session-4", "worker_exited", null, null],
  ]);
  f.child.emit("exit", 1);
  expect(closed(f.events)).toHaveLength(4);
});

test("a slow session command fails alone; the worker and its sessions keep running", async () => {
  vi.useFakeTimers();
  const f = await started({ commandMs: 20 });
  await f.openSession("session-1");
  const compact = f.worker.request("execute", {
    type: "compact",
    organizationId: "org-1",
    sessionId: "session-1",
  });
  const failed = rejects(compact, { code: "timeout" });
  await advanceTimersAsync(20);
  await failed;
  expect(f.child.killed).toBe(false);
  expect(closed(f.events)).toEqual([]);
  const sent = f.child.posted("inspect");
  const status = f.worker.request("inspect");
  await sent;
  f.child.answer("inspect", []);
  expect(await status).toEqual([]);
});

test("a hung worker request stops the worker and closes its sessions", async () => {
  vi.useFakeTimers();
  const f = await started({ requestMs: 20 });
  await f.openSession("session-1");
  const stopped = rejects(f.worker.request("inspect"), { code: "worker-stopped" });
  await advanceTimersAsync(20);
  await stopped;
  expect(f.child.killed).toBe(true);
  expect(closed(f.events)).toEqual([["session-1", "worker_exited", null, null]]);
});

test("dispose closes every open session", async () => {
  const f = await started();
  await f.openSession("session-1");
  f.worker.dispose();
  expect(closed(f.events)).toEqual([["session-1", "worker_exited", null, null]]);
});

for (const code of ["resume-failed", "not-initialized", "ENOENT", "toString", undefined])
  test(`worker failures forward only registered codes: ${code ?? "missing"}`, async () => {
    const f = await started();
    const sent = f.child.posted("inspect");
    const pending = f.worker.request("inspect");
    const request = await sent;
    f.child.emit("message", { id: request.id, error: "Native details", code });
    await rejects(pending, {
      code: code === "resume-failed" || code === "not-initialized" ? code : "harness-error",
      message: "Harness operation failed.",
    });
    f.worker.dispose();
    f.child.answer("dispose");
  });
