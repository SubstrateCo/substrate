import type { HarnessEventBody } from "@startup-os/contracts/harness";

import { OpenCodeSession, type OpenCodeApi } from "./opencode.ts";
import { unattendedDenial, type AdapterContext } from "./types.ts";
import type { OpenCodeEvent } from "@opencode/client";
import { expect, test } from "bun:test";

/* oxlint-disable deslop/no-unknown-parameters, deslop/no-unsafe-dictionary-type, deslop/no-chained-type-assertions -- The fake client records native call payloads, and tests build partial native events. */

function event(type: string, data: Record<string, unknown>): OpenCodeEvent {
  // SAFETY: tests build only the event fields the adapter reads.
  return { type, data: { sessionID: "ses_1", ...data } } as unknown as OpenCodeEvent;
}

function setup(inbox: string[] = []) {
  const calls: { method: string; input: unknown }[] = [];
  const record = (method: string) => async (input: unknown) => {
    calls.push({ method, input });
    return method === "inbox.list" ? inbox.map((id) => ({ id })) : undefined;
  };
  // SAFETY: the fake implements the methods the adapter calls with the payloads it records.
  const client = {
    session: {
      prompt: record("prompt"),
      interrupt: record("interrupt"),
      compact: record("compact"),
      inbox: { list: record("inbox.list"), cancel: record("inbox.cancel") },
      form: { reply: record("form.reply"), cancel: record("form.cancel") },
    },
    permission: { reply: record("permission.reply") },
  } as unknown as OpenCodeApi;
  const events: HarnessEventBody[] = [];
  const context: AdapterContext = {
    directory: ".",
    executable: "opencode",
    prefix: "",
    emit: (body) => events.push(body),
  };
  const session = new OpenCodeSession(context, client, "ses_1");
  return { session, adapter: session.adapter(async () => {}), calls, events };
}

function prompts(calls: { method: string; input: unknown }[]) {
  return calls.flatMap((call) =>
    // SAFETY: prompt calls carry SessionPromptInput.
    call.method === "prompt" ? [call.input as { id: string; text: string; delivery?: string }] : [],
  );
}

test("steer prompts with delivery steer, and delivery marks the input consumed", async () => {
  const f = setup();
  const done = f.adapter.turn({ inputIds: ["a"], text: "Turn" }, { mode: "interactive" });
  await f.adapter.steer!({ inputId: "b", text: "More" });
  const [turn, steer] = prompts(f.calls);
  expect(turn).toMatchObject({ sessionID: "ses_1", text: "Turn" });
  expect(turn!.delivery).toBeUndefined();
  expect(steer).toMatchObject({ sessionID: "ses_1", text: "More", delivery: "steer" });
  expect(steer!.id.startsWith("msg_") && steer!.id > turn!.id).toBe(true);
  f.session.handle(event("session.inbox.delivered", { inboxID: turn!.id }));
  f.session.handle(event("session.inbox.delivered", { inboxID: steer!.id }));
  expect(f.events).toContainEqual({ type: "input.consumed", inputId: "b" });
  f.session.handle(event("session.execution.succeeded", {}));
  expect(await done).toMatchObject({ status: "completed", consumedInputIds: ["a", "b"] });
});

test("a tool step starts with its input, so its label says what it does", () => {
  const f = setup();
  f.session.handle(event("session.tool.input.started", { id: "t1", name: "skill" }));
  expect(f.events).toEqual([]);
  f.session.handle(event("session.tool.called", { id: "t1", input: { name: "tasks" } }));
  f.session.handle(event("session.tool.success", { id: "t1" }));
  // Failed before its call: the step still shows, by its tool name.
  f.session.handle(event("session.tool.input.started", { id: "t2", name: "read" }));
  f.session.handle(event("session.tool.failed", { id: "t2" }));
  expect(f.events).toEqual([
    { type: "item.started", itemId: "t1", itemType: "tool", title: "Use skill · tasks" },
    { type: "item.completed", itemId: "t1", status: "completed" },
    { type: "item.started", itemId: "t2", itemType: "tool", title: "Read" },
    { type: "item.completed", itemId: "t2", status: "failed" },
  ]);
});

test("an execution that ends before our input is delivered does not end our turn", async () => {
  const f = setup();
  let finished = false;
  const done = f.adapter
    .turn({ inputIds: ["a"], text: "Turn" }, { mode: "interactive" })
    .then((value) => {
      finished = true;
      return value;
    });
  await Promise.resolve();
  f.session.handle(event("session.execution.succeeded", {}));
  await Promise.resolve();
  expect(finished).toBe(false);
  f.session.handle(event("session.inbox.delivered", { inboxID: prompts(f.calls)[0]!.id }));
  f.session.handle(event("session.execution.interrupted", { reason: "user" }));
  expect((await done).status).toBe("interrupted");
});

test("interrupt withdraws still-queued steered input and reports it", async () => {
  const inbox: string[] = [];
  const f = setup(inbox);
  const done = f.adapter.turn({ inputIds: ["a"], text: "Turn" }, { mode: "interactive" });
  await f.adapter.steer!({ inputId: "b", text: "More" });
  const [turn, steer] = prompts(f.calls);
  f.session.handle(event("session.inbox.delivered", { inboxID: turn!.id }));
  inbox.push(steer!.id);
  expect(await f.adapter.interrupt()).toEqual({ stillQueuedInputIds: ["b"] });
  expect(f.calls).toContainEqual({
    method: "inbox.cancel",
    input: { sessionID: "ses_1", inboxID: steer!.id },
  });
  f.session.handle(event("session.execution.interrupted", { reason: "user" }));
  expect(await done).toMatchObject({ status: "interrupted", consumedInputIds: ["a"] });
});

test("unattended turns reject permissions and cancel forms without opening requests", async () => {
  const f = setup();
  void f.adapter.turn({ inputIds: ["a"], text: "Routine" }, { mode: "unattended" });
  f.session.handle(event("permission.asked", { id: "per_1", action: "bash", resources: [] }));
  f.session.handle(event("form.created", { form: { id: "frm_1", sessionID: "ses_1" } }));
  await Promise.resolve();
  expect(f.calls.filter((call) => call.method !== "prompt")).toEqual([
    {
      method: "permission.reply",
      input: {
        sessionID: "ses_1",
        requestID: "per_1",
        decision: "reject",
        message: unattendedDenial,
      },
    },
    {
      method: "form.cancel",
      input: { sessionID: "ses_1", formID: "frm_1", message: unattendedDenial },
    },
  ]);
  expect(f.events.some((body) => body.type === "request.opened")).toBe(false);
});
