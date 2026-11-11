import type { HarnessEventBody } from "@substrate/contracts/harness";

import { CodexSession } from "./codex.ts";
import type { RpcMessage } from "./json-rpc.ts";
import { unattendedDenial, type AdapterContext } from "./types.ts";
import { expect, test } from "bun:test";

/* oxlint-disable deslop/no-unknown-parameters -- The fake RPC records native request payloads. */

function setup() {
  const sent: RpcMessage[] = [];
  const events: HarnessEventBody[] = [];
  const requests: { method: string; params: unknown }[] = [];
  const context: AdapterContext = {
    directory: ".",
    executable: "codex",
    prefix: "",
    emit: (body) => events.push(body),
  };
  const session = new CodexSession(context, {
    send: (message) => sent.push(message),
    request: async <T>(method: string, params: unknown) => {
      requests.push({ method, params });
      // SAFETY: turn/start is the only request these tests make.
      return { turn: { id: "turn-1" } } as T;
    },
  });
  session.nativeSessionId = "thread-1";
  return { session, adapter: session.adapter(async () => {}), sent, events, requests };
}

test("each turn sets its approval policy: never when unattended, on-request when interactive", async () => {
  const f = setup();
  void f.adapter.turn({ inputIds: ["a"], text: "Routine" }, { mode: "unattended" });
  await Promise.resolve();
  f.session.handle({
    method: "turn/completed",
    params: { threadId: "thread-1", turn: { id: "turn-1", status: "completed" } },
  });
  void f.adapter.turn({ inputIds: ["b"], text: "Owner" }, { mode: "interactive" });
  await Promise.resolve();
  expect(f.requests).toEqual([
    {
      method: "turn/start",
      params: {
        threadId: "thread-1",
        input: [{ type: "text", text: "Routine" }],
        approvalPolicy: "never",
      },
    },
    {
      method: "turn/start",
      params: {
        threadId: "thread-1",
        input: [{ type: "text", text: "Owner" }],
        approvalPolicy: "on-request",
      },
    },
  ]);
});

test("unattended turns decline approvals, user input and elicitation", async () => {
  const f = setup();
  void f.adapter.turn({ inputIds: ["a"], text: "Routine" }, { mode: "unattended" });
  await Promise.resolve();
  for (const [id, method] of [
    [1, "item/commandExecution/requestApproval"],
    [2, "item/tool/requestUserInput"],
    [3, "mcpServer/elicitation/request"],
  ] as const)
    f.session.handle({ id, method, params: { threadId: "thread-1" } });
  expect(f.sent).toEqual([
    { id: 1, result: { decision: "decline" } },
    { id: 2, error: { code: -32000, message: unattendedDenial } },
    { id: 3, result: { action: "decline", content: null } },
  ]);
  expect(f.events.some((body) => body.type === "request.opened")).toBe(false);
});

test("tool items keep native IDs and the turn reports its whole input as consumed", async () => {
  const f = setup();
  const done = f.adapter.turn({ inputIds: ["a", "b"], text: "Turn" }, { mode: "interactive" });
  await Promise.resolve();
  const item = { id: "item-1", type: "commandExecution", command: "bun test" };
  f.session.handle({
    method: "item/started",
    params: { threadId: "thread-1", turnId: "turn-1", item },
  });
  f.session.handle({
    method: "item/completed",
    params: { threadId: "thread-1", turnId: "turn-1", item: { ...item, status: "failed" } },
  });
  f.session.handle({
    method: "turn/completed",
    params: { threadId: "thread-1", turn: { id: "turn-1", status: "completed" } },
  });
  expect(f.events).toEqual([
    {
      type: "item.started",
      itemId: "item-1",
      itemType: "commandExecution",
      title: "Run · bun test",
    },
    { type: "item.completed", itemId: "item-1", status: "failed" },
  ]);
  expect(await done).toEqual({ status: "completed", consumedInputIds: ["a", "b"] });
});
