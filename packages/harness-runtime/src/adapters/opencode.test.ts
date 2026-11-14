import type { HarnessEventBody } from "@substrate/contracts/harness";

import { openCodeConfig, OpenCodeSession, type OpenCodeApi } from "./opencode.ts";
import { unattendedDenial, type NativePrefixContext } from "./types.ts";
import type { OpenCodeEvent } from "@opencode/client";
import { expect, test } from "bun:test";

type FixtureEvent = Extract<
  OpenCodeEvent,
  {
    type:
      | "session.inbox.delivered"
      | "session.execution.succeeded"
      | "session.execution.interrupted"
      | "session.tool.input.started"
      | "session.tool.called"
      | "session.tool.success"
      | "session.tool.failed"
      | "permission.asked"
      | "form.created";
  }
>;
type EventData<Event> = Event extends FixtureEvent
  ? Omit<Event, "id" | "created" | "durable">
  : never;

function event(input: EventData<FixtureEvent>): OpenCodeEvent {
  const envelope = { id: "evt_1", created: 0 };
  if (input.type === "permission.asked" || input.type === "form.created") {
    return { ...envelope, ...input };
  }
  if (input.type === "session.tool.success" || input.type === "session.tool.failed") {
    return { ...envelope, ...input, durable: { aggregateID: "ses_1", seq: 1, version: 2 } };
  }
  return { ...envelope, ...input, durable: { aggregateID: "ses_1", seq: 1, version: 1 } };
}

function setup(inbox: string[] = []) {
  const calls: { method: string; input: unknown }[] = [];
  const prompts: Parameters<OpenCodeApi["session"]["prompt"]>[0][] = [];
  const record =
    <Input>(method: string) =>
    async (input: Input) => {
      calls.push({ method, input });
    };
  const client: OpenCodeApi = {
    session: {
      prompt: async (input) => {
        calls.push({ method: "prompt", input });
        prompts.push(input);
        return {
          id: input.id!,
          sessionID: input.sessionID,
          type: "user",
          time: { created: 0 },
          payload: { text: input.text },
          delivery: input.delivery ?? "queue",
        };
      },
      interrupt: async (input) => {
        calls.push({ method: "interrupt", input });
        return { interrupted: true };
      },
      compact: async (input) => {
        calls.push({ method: "compact", input });
        return {
          id: "msg_compact",
          sessionID: input.sessionID,
          type: "compaction",
          time: { created: 0 },
          payload: {},
          delivery: "queue",
        };
      },
      inbox: {
        list: async (input) => {
          calls.push({ method: "inbox.list", input });
          return inbox.map((id) => ({
            id,
            sessionID: input.sessionID,
            type: "user",
            time: { created: 0 },
            payload: { text: "Queued" },
            delivery: "steer",
          }));
        },
        cancel: record("inbox.cancel"),
      },
      form: { reply: record("form.reply"), cancel: record("form.cancel") },
    },
    permission: { reply: record("permission.reply") },
  };
  const events: HarnessEventBody[] = [];
  const context: NativePrefixContext = {
    directory: ".",
    executable: "opencode",
    prefix: "",
    emit: (body) => events.push(body),
  };
  const session = new OpenCodeSession(context, client, "ses_1");
  return { session, adapter: session.adapter(async () => {}), calls, prompts, events };
}

test("managed OpenCode sessions use native on-demand tools without embedding credentials in config", () => {
  const context: NativePrefixContext = {
    directory: ".",
    executable: "opencode",
    prefix: "Managed policy",
    emit: () => {},
    lease: {
      url: "http://127.0.0.1:1234/mcp",
      token: "session-secret",
      organizationId: "org-a",
      agentId: "agent-a",
      sessionId: "session-a",
      bind: () => {},
      unbind: () => {},
      revoke: () => {},
    },
  };
  const config = openCodeConfig(context, ".substrate/managed-instructions.md");
  expect(config.instructions).toEqual([".substrate/managed-instructions.md"]);
  expect(config.mcp?.servers?.substrate).toEqual({
    type: "remote",
    url: context.lease!.url,
    oauth: false,
    codemode: true,
    headers: { Authorization: "Bearer {env:SUBSTRATE_MCP_TOKEN}" },
  });
  expect(JSON.stringify(config)).not.toContain("session-secret");
  expect(openCodeConfig({ ...context, lease: undefined }, "managed.md").mcp).toBeUndefined();
});

test("steer prompts with delivery steer, and delivery marks the input consumed", async () => {
  const f = setup();
  const done = f.adapter.turn({ inputIds: ["a"], text: "Turn" }, { mode: "interactive" });
  await f.adapter.steer!({ inputId: "b", text: "More" });
  const [turn, steer] = f.prompts;
  expect(turn).toMatchObject({ sessionID: "ses_1", text: "Turn" });
  expect(turn!.delivery).toBeUndefined();
  expect(steer).toMatchObject({ sessionID: "ses_1", text: "More", delivery: "steer" });
  expect(steer!.id!.startsWith("msg_") && steer!.id! > turn!.id!).toBe(true);
  f.session.handle(
    event({ type: "session.inbox.delivered", data: { sessionID: "ses_1", inboxID: turn!.id! } }),
  );
  f.session.handle(
    event({ type: "session.inbox.delivered", data: { sessionID: "ses_1", inboxID: steer!.id! } }),
  );
  expect(f.events).toContainEqual({ type: "input.consumed", inputId: "b" });
  f.session.handle(event({ type: "session.execution.succeeded", data: { sessionID: "ses_1" } }));
  expect(await done).toMatchObject({ status: "completed", consumedInputIds: ["a", "b"] });
});

test("a tool step starts with its input, so its label says what it does", () => {
  const f = setup();
  f.session.handle(
    event({
      type: "session.tool.input.started",
      data: { sessionID: "ses_1", assistantMessageID: "msg_1", id: "t1", name: "skill" },
    }),
  );
  expect(f.events).toEqual([]);
  f.session.handle(
    event({
      type: "session.tool.called",
      data: {
        sessionID: "ses_1",
        assistantMessageID: "msg_1",
        id: "t1",
        input: { name: "tasks" },
        executed: true,
      },
    }),
  );
  f.session.handle(
    event({
      type: "session.tool.success",
      data: {
        sessionID: "ses_1",
        assistantMessageID: "msg_1",
        id: "t1",
        content: [{ type: "text", text: "Done" }],
        executed: true,
      },
    }),
  );
  // Failed before its call: the step still shows, by its tool name.
  f.session.handle(
    event({
      type: "session.tool.input.started",
      data: { sessionID: "ses_1", assistantMessageID: "msg_1", id: "t2", name: "read" },
    }),
  );
  f.session.handle(
    event({
      type: "session.tool.failed",
      data: {
        sessionID: "ses_1",
        assistantMessageID: "msg_1",
        id: "t2",
        error: { type: "Error", message: "Failed" },
        executed: false,
      },
    }),
  );
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
  f.session.handle(event({ type: "session.execution.succeeded", data: { sessionID: "ses_1" } }));
  await Promise.resolve();
  expect(finished).toBe(false);
  f.session.handle(
    event({
      type: "session.inbox.delivered",
      data: { sessionID: "ses_1", inboxID: f.prompts[0]!.id! },
    }),
  );
  f.session.handle(
    event({ type: "session.execution.interrupted", data: { sessionID: "ses_1", reason: "user" } }),
  );
  expect((await done).status).toBe("interrupted");
});

test("interrupt withdraws still-queued steered input and reports it", async () => {
  const inbox: string[] = [];
  const f = setup(inbox);
  const done = f.adapter.turn({ inputIds: ["a"], text: "Turn" }, { mode: "interactive" });
  await f.adapter.steer!({ inputId: "b", text: "More" });
  const [turn, steer] = f.prompts;
  f.session.handle(
    event({ type: "session.inbox.delivered", data: { sessionID: "ses_1", inboxID: turn!.id! } }),
  );
  inbox.push(steer!.id!);
  expect(await f.adapter.interrupt()).toEqual({ stillQueuedInputIds: ["b"] });
  expect(f.calls).toContainEqual({
    method: "inbox.cancel",
    input: { sessionID: "ses_1", inboxID: steer!.id },
  });
  f.session.handle(
    event({ type: "session.execution.interrupted", data: { sessionID: "ses_1", reason: "user" } }),
  );
  expect(await done).toMatchObject({ status: "interrupted", consumedInputIds: ["a"] });
});

test("unattended turns reject permissions and cancel forms without opening requests", async () => {
  const f = setup();
  void f.adapter.turn({ inputIds: ["a"], text: "Routine" }, { mode: "unattended" });
  f.session.handle(
    event({
      type: "permission.asked",
      data: { sessionID: "ses_1", id: "per_1", action: "bash", resources: [] },
    }),
  );
  f.session.handle(
    event({
      type: "form.created",
      data: {
        form: {
          id: "frm_1",
          sessionID: "ses_1",
          title: "Question",
          fields: [{ key: "answer", type: "string" }],
        },
      },
    }),
  );
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
