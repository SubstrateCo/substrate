import type { HarnessEventBody, TurnResult } from "@substrate/contracts/harness";

import { ClaudeSession, type ClaudeQuery } from "./claude.ts";
import { InputQueue } from "./input-queue.ts";
import { unattendedDenial, type AdapterContext, type EventScope } from "./types.ts";
import type { SDKMessage, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { expect, test } from "bun:test";

/* oxlint-disable deslop/no-unsafe-dictionary-type, deslop/no-chained-type-assertions -- Tests build partial native SDK frames; the adapter reads only the fields given here. */

const turnInput = "11111111-1111-4111-8111-111111111111";
const steerInput = "22222222-2222-4222-8222-222222222222";

function result(fields: Record<string, unknown>): SDKMessage {
  // SAFETY: tests build only the result fields the adapter reads.
  return {
    type: "result",
    subtype: "success",
    is_error: false,
    usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 2 },
    modelUsage: { model: { contextWindow: 200000 } },
    ...fields,
  } as unknown as SDKMessage;
}
function assistant(fields: Record<string, unknown>, content: unknown[]): SDKMessage {
  // SAFETY: tests build only the assistant fields the adapter reads.
  return {
    type: "assistant",
    parent_tool_use_id: null,
    message: { content, usage: { input_tokens: 100, output_tokens: 20 } },
    ...fields,
  } as unknown as SDKMessage;
}

function setup(receipt?: (sent: SDKUserMessage[]) => { still_queued: string[] }) {
  const events: { body: HarnessEventBody; scope: EventScope }[] = [];
  const context: AdapterContext = {
    directory: ".",
    executable: "claude",
    prefix: "",
    emit: (body, scope = "turn") => events.push({ body, scope }),
  };
  const session = new ClaudeSession(context, "native-1");
  const output = new InputQueue<SDKMessage>();
  let interrupts = 0;
  const sent: SDKUserMessage[] = [];
  const query: ClaudeQuery = {
    [Symbol.asyncIterator]: () => output[Symbol.asyncIterator](),
    interrupt: async () => {
      interrupts++;
      return receipt?.(sent);
    },
    close: () => output.close(),
  };
  void (async () => {
    for await (const message of session.input) sent.push(message);
  })();
  const adapter = session.attach(query);
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  return {
    adapter,
    session,
    events,
    sent,
    push: async (message: SDKMessage) => {
      output.push(message);
      await flush();
    },
    flush,
    interrupts: () => interrupts,
  };
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

test("each sent message has a fresh uuid, and consumption maps back to our input IDs", async () => {
  const f = setup();
  const done = f.adapter.turn({ inputIds: [turnInput], text: "Turn" }, { mode: "interactive" });
  await f.adapter.steer!({ inputId: steerInput, text: "Also this" });
  await f.flush();
  expect(f.sent.map((message) => message.message.content)).toEqual(["Turn", "Also this"]);
  const [turnUuid, steerUuid] = f.sent.map((message) => message.uuid!);
  for (const uuid of [turnUuid, steerUuid]) {
    expect(uuid).toMatch(uuidPattern);
    expect([turnInput, steerInput]).not.toContain(uuid!);
  }
  expect(turnUuid).not.toBe(steerUuid);
  await f.push(
    assistant({ user_message_uuids: [turnUuid, steerUuid] }, [{ type: "text", text: "Done" }]),
  );
  expect(f.events.filter(({ body }) => body.type === "input.consumed")).toEqual([
    { body: { type: "input.consumed", inputId: steerInput }, scope: "turn" },
  ]);
  await f.push(result({ user_message_uuids: [turnUuid, steerUuid] }));
  const settled: TurnResult = await done;
  expect(settled).toMatchObject({
    status: "completed",
    consumedInputIds: [turnInput, steerInput],
    usage: { contextWindow: 200000, contextUsed: 120 },
  });
});

test("a retried attempt in the same native transcript sends new uuids for the same input", async () => {
  const first = setup();
  void first.adapter.turn({ inputIds: [turnInput], text: "Turn" }, { mode: "interactive" });
  await first.flush();
  // Recovery resumes the native session in a new adapter and sends the same inbox items again.
  const retry = setup();
  const done = retry.adapter.turn({ inputIds: [turnInput], text: "Turn" }, { mode: "interactive" });
  await retry.flush();
  const retried = retry.sent[0]!.uuid!;
  expect(retried).not.toBe(first.sent[0]!.uuid!);
  await retry.push(result({ user_message_uuids: [retried] }));
  expect(await done).toMatchObject({ status: "completed", consumedInputIds: [turnInput] });
});

test("unattended turns deny every native prompt without opening a request", async () => {
  const f = setup();
  void f.adapter.turn({ inputIds: [turnInput], text: "Routine" }, { mode: "unattended" });
  const signal = new AbortController().signal;
  // SAFETY: the adapter reads only signal from the permission options.
  const options = { signal } as Parameters<typeof f.session.canUseTool>[2];
  expect(await f.session.canUseTool("Bash", { command: "ls" }, options)).toEqual({
    behavior: "deny",
    message: unattendedDenial,
  });
  expect(f.events.some(({ body }) => body.type === "request.opened")).toBe(false);
});

test("native output outside our turn is session-scoped and does not complete our turn", async () => {
  const f = setup();
  await f.push(assistant({}, [{ type: "text", text: "Before any turn" }]));
  let finished = false;
  const done = f.adapter
    .turn({ inputIds: [turnInput], text: "Turn" }, { mode: "interactive" })
    .then((value) => {
      finished = true;
      return value;
    });
  const other = "33333333-3333-4333-8333-333333333333";
  await f.push(
    assistant({ user_message_uuids: [other] }, [
      { type: "text", text: "Native work" },
      { type: "tool_use", id: "tool-1", name: "Bash" },
    ]),
  );
  // SAFETY: tests build only the user frame fields the adapter reads.
  await f.push({
    type: "user",
    message: { content: [{ type: "tool_result", tool_use_id: "tool-1" }] },
  } as unknown as SDKMessage);
  await f.push(result({ user_message_uuids: [other] }));
  expect(finished).toBe(false);
  expect(
    f.events
      .filter(({ body }) => body.type !== "usage.updated")
      .map(({ body, scope }) => [body.type, scope]),
  ).toEqual([
    ["text", "session"],
    ["text", "session"],
    ["item.started", "session"],
    ["item.completed", "session"],
  ]);
  await f.push(result({ user_message_uuids: [f.sent[0]!.uuid!] }));
  expect(await done).toMatchObject({ status: "completed", consumedInputIds: [turnInput] });
});

test("interrupt maps still-queued uuids back to steered input IDs", async () => {
  const f = setup((sent) => ({ still_queued: [sent[1]!.uuid!] }));
  const done = f.adapter.turn({ inputIds: [turnInput], text: "Turn" }, { mode: "interactive" });
  await f.flush();
  const turnUuid = f.sent[0]!.uuid!;
  await f.push(assistant({ user_message_uuids: [turnUuid] }, []));
  await f.adapter.steer!({ inputId: steerInput, text: "Late" });
  await f.flush();
  expect(await f.adapter.interrupt()).toEqual({ stillQueuedInputIds: [steerInput] });
  await f.push(result({ user_message_uuids: [turnUuid], is_error: true }));
  expect(await done).toMatchObject({ status: "interrupted", consumedInputIds: [turnInput] });
  // The still-queued input starts on its own later; the adapter stops it.
  await f.push(assistant({ user_message_uuids: [f.sent[1]!.uuid!] }, []));
  expect(f.interrupts()).toBe(2);
});
