import type { LocalToolRequest } from "@substrate/contracts/agent-tools/mcp";

import type { HostFinish } from "../ports.ts";
import {
  agentId,
  CodeError,
  organizationId,
  permissionRequest,
  runtimeFixture,
} from "./test-support.ts";
import { afterEach, expect, test } from "bun:test";

let fixture: Awaited<ReturnType<typeof runtimeFixture>> | undefined;
afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

async function started(options: Parameters<typeof runtimeFixture>[0] = {}) {
  fixture = await runtimeFixture(options);
  await fixture.runtime.start();
  await fixture.settle();
  return fixture;
}

test("a claimed turn runs with its server turn context, records its transcript and reports a quiet finish", async () => {
  const f = await started();
  const sent = await f.message({ body: "Status?" });
  const turn = f.turns()[0]!;
  expect(turn).toMatchObject({
    turnId: sent.turnId,
    sessionId: sent.sessionId,
    mode: "interactive",
  });
  expect(turn.context).toEqual({ turnId: sent.turnId, attempt: 1 });
  expect(turn.input.text).toContain(">Status?</item>");
  expect(f.hostCalls("start").map((call) => call.body)).toEqual([
    { attempt: 1, droppedItemIds: [] },
  ]);

  await f.emit(turn.turnId, { type: "turn.started" });
  await f.emit(turn.turnId, {
    type: "item.started",
    itemId: "i1",
    itemType: "mcp",
    title: "search",
  });
  await f.emit(turn.turnId, { type: "item.completed", itemId: "i1", status: "completed" });
  await f.emit(turn.turnId, { type: "turn.completed", result: { status: "completed" } });
  expect((await f.runtime.turnEvents(turn.turnId)).map((event) => event.kind)).toEqual([
    "turn_started",
    "tool_started",
    "tool_completed",
    "turn_finished",
  ]);
  expect(f.finished(turn.turnId)).toMatchObject({
    attempt: 1,
    status: "completed",
    outcome: "silent",
    interruption: null,
  } satisfies Partial<HostFinish>);
  expect(f.status(turn.turnId)).toBe("completed");
  const [run] = await f.runtime.turnRuns(turn.turnId);
  expect(run).toMatchObject({ attempt: 1, sessionId: sent.sessionId, epoch: 0, eventCount: 4 });
  expect(run!.envelope).toBe(turn.input.text);
});

test("a tool start reports the activity once the report window passes, without a host cycle", async () => {
  const f = await started();
  await f.message();
  const turn = f.turns()[0]!;
  const cycles = f.hostCalls("sync").length;
  await f.emit(turn.turnId, {
    type: "item.started",
    itemId: "i1",
    itemType: "mcp",
    title: "search",
  });
  expect(f.hostCalls("progress").filter((call) => call.turnId === turn.turnId)).toHaveLength(1);
  await f.advance(2_000);
  expect(f.hostCalls("progress").at(-1)!.body).toMatchObject({ attempt: 1, activity: "search" });
  expect(f.hostCalls("sync")).toHaveLength(cycles);
});

test("a reply recorded from the MCP call makes the turn replied", async () => {
  const f = await started();
  const { conversationId } = await f.message();
  const turn = f.turns()[0]!;
  const messageId = crypto.randomUUID();
  await f.runtime.observeToolCall(
    {
      tool: "reply",
      organizationId,
      agentId,
      turn: turn.context,
      input: { requestId: "r", body: "Done" },
    },
    {
      success: true,
      data: {
        messageId,
        conversationId,
        threadId: null,
        questionId: null,
        createdAt: new Date().toISOString(),
      },
    },
  );
  await f.emit(turn.turnId, { type: "turn.completed", result: { status: "completed" } });
  expect(f.finished(turn.turnId)?.outcome).toBe("replied");
  const outputs = await f.store.events.ofKinds(organizationId, turn.turnId, ["output"]);
  expect(outputs.map((event) => event.data)).toMatchObject([{ kind: "message", id: messageId }]);
});

test("a message the owner can no longer see is dropped at start and runs no turn", async () => {
  const f = await started();
  const sent = await f.message({ visible: false });
  expect(f.hostCalls("start").map((call) => call.body)).toEqual([
    { attempt: 1, droppedItemIds: [sent.item.id] },
  ]);
  expect(f.status(sent.turnId)).toBe("cancelled");
  expect(f.turns()).toEqual([]);
});

test("the agent's stored MCP servers are sent with the open command", async () => {
  const f = await started();
  const server = { id: "files", name: "Files", transport: "stdio" as const, command: "files-mcp" };
  await f.store.mcpServers.save(organizationId, agentId, server, 0);
  await f.message();
  expect(f.commands.find((command) => command.type === "open")).toMatchObject({
    mcpServers: [{ id: "files", command: "files-mcp" }],
  });
});

test("a new message for the live session is steered, delivered, and read", async () => {
  const f = await started({ capabilities: { steer: true, steerEvidence: true } });
  const sent = await f.message();
  const turn = f.turns()[0]!;
  const next = f.ownerItem({ conversationId: sent.conversationId, body: "Also this" });
  f.control.waiting.push(next.item);
  await f.hint();
  const steer = f.commands.find((command) => command.type === "steer");
  expect(steer).toMatchObject({
    turnId: turn.turnId,
    inputId: next.item.id,
    text: expect.stringContaining("Also this"),
  });
  expect(f.hostCalls("steerResult").map((call) => call.body)).toEqual([
    { turnId: turn.turnId, result: "delivered" },
  ]);

  await f.emit(turn.turnId, { type: "input.consumed", inputId: next.item.id });
  await f.advance(2_000);
  expect(f.hostCalls("progress").at(-1)!.body).toMatchObject({ consumedItemIds: [next.item.id] });
  await f.emit(turn.turnId, { type: "turn.completed", result: { status: "completed" } });
  expect(f.status(turn.turnId)).toBe("completed");
});

test("a steer refused before delivery puts the message back for the next turn", async () => {
  const f = await started({ capabilities: { steer: true } });
  const sent = await f.message();
  const turn = f.turns()[0]!;
  f.hooks.command = (command) =>
    command.type === "steer" ? Promise.reject(new CodeError("steer-unsupported")) : undefined;
  const next = f.ownerItem({ conversationId: sent.conversationId });
  f.control.waiting.push(next.item);
  await f.hint();
  expect(f.hostCalls("steerResult").at(-1)!.body).toMatchObject({ result: "undelivered" });
  expect(f.control.waiting.map((item) => item.id)).toEqual([next.item.id]);
  await f.emit(turn.turnId, { type: "turn.completed", result: { status: "completed" } });
  expect(f.status(turn.turnId)).toBe("completed");
});

test("a steer that may have been delivered is reported uncertain and never sent again", async () => {
  const f = await started({ capabilities: { steer: true } });
  const sent = await f.message();
  const turn = f.turns()[0]!;
  f.hooks.command = (command) =>
    command.type === "steer" ? Promise.reject(new CodeError("harness-error")) : undefined;
  const next = f.ownerItem({ conversationId: sent.conversationId });
  f.control.waiting.push(next.item);
  await f.hint();
  expect(f.hostCalls("steerResult").at(-1)!.body).toMatchObject({ result: "uncertain" });
  f.hooks.command = undefined;
  await f.emit(turn.turnId, { type: "turn.completed", result: { status: "completed" } });
  await f.hint();
  expect(f.commands.filter((command) => command.type === "steer")).toHaveLength(1);
  expect(f.turns()).toHaveLength(1);
});

test("consumption evidence that arrives while the steer command runs still counts", async () => {
  const f = await started({ capabilities: { steer: true, steerEvidence: true } });
  const sent = await f.message();
  const turn = f.turns()[0]!;
  f.hooks.command = (command) => {
    if (command.type !== "steer") return undefined;
    f.runtime.onHarnessEvent({
      type: "input.consumed",
      inputId: command.inputId,
      sessionId: command.sessionId,
      organizationId,
      turnId: turn.turnId,
      generation: turn.generation,
      timestamp: f.now(),
    });
    return Promise.resolve();
  };
  const next = f.ownerItem({ conversationId: sent.conversationId });
  f.control.waiting.push(next.item);
  await f.hint();
  await f.emit(turn.turnId, { type: "turn.completed", result: { status: "completed" } });
  expect(f.finished(turn.turnId)?.consumedItemIds).toContain(next.item.id);
  expect(f.status(turn.turnId)).toBe("completed");
});

test("a source hidden before its steer is dropped instead of sent", async () => {
  const f = await started({ capabilities: { steer: true } });
  const sent = await f.message();
  const next = f.ownerItem({ conversationId: sent.conversationId, visible: false });
  f.control.waiting.push(next.item);
  await f.hint();
  expect(f.commands.some((command) => command.type === "steer")).toBe(false);
  expect(f.hostCalls("steerResult").at(-1)!.body).toMatchObject({ result: "inaccessible" });
});

test("a decision that a held call waits for, or already returned, never steers into its turn", async () => {
  const f = await started({ capabilities: { steer: true } });
  await f.message();
  const turn = f.turns()[0]!;
  const call = {
    tool: "delete_task" as const,
    organizationId,
    agentId,
    turn: turn.context,
    input: {},
  };
  const proposalId = crypto.randomUUID();
  const release = f.runtime.awaitApproval(call, proposalId)!;
  await f.hint();
  expect(f.hostCalls("steer").at(-1)!.body).toMatchObject({ awaitingRequestIds: [proposalId] });
  await f.runtime.observeToolCall(call, { success: true, data: {} }, { requestId: proposalId });
  release();
  await f.settle();
  expect(f.hostCalls("steer").at(-1)!.body).toMatchObject({ awaitingRequestIds: [proposalId] });
  // Only an interactive live turn waits for a decision.
  expect(f.runtime.awaitApproval({ ...call, turn: { ...turn.context, attempt: 2 } }, "x")).toBe(
    null,
  );
});

test("a decision that a held call returned is consumed at the server, so it starts no later turn", async () => {
  const f = await started();
  const sent = await f.message();
  const turn = f.turns()[0]!;
  const call = {
    tool: "delete_task" as const,
    organizationId,
    agentId,
    turn: turn.context,
    input: {},
  };
  const proposalId = crypto.randomUUID();
  const result = f.control.item(sent.sessionId, {
    source: "approval_result",
    requestId: proposalId,
    anchorMessageId: null,
  });
  f.control.waiting.push(result);
  const release = f.runtime.awaitApproval(call, proposalId)!;
  await f.runtime.observeToolCall(call, { success: true, data: {} }, { requestId: proposalId });
  release();
  await f.settle();
  // The server learns it before the agent sees the result, not only when the turn ends.
  expect(f.hostCalls("progress").at(-1)!.body).toMatchObject({ decidedRequestIds: [proposalId] });
  expect(result.status).toBe("consumed");
  await f.emit(turn.turnId, { type: "turn.completed", result: { status: "completed" } });
  expect(f.finished(turn.turnId)?.decidedRequestIds).toEqual([proposalId]);
  expect(f.control.waiting).toEqual([]);
});

test("a blocking request opens on the server for the turn, gets the owner's answer, and expires as a denial", async () => {
  const f = await started();
  await f.message();
  const turn = f.turns()[0]!;
  await f.emit(turn.turnId, { type: "turn.started" });
  await f.emit(turn.turnId, {
    type: "request.opened",
    requestId: "n1",
    kind: "permission",
    data: permissionRequest,
  });
  const opened = f.requestPosts.find((post) => post.method === "openRequest")!.body;
  expect(opened).toMatchObject({ turnId: turn.turnId, nativeRequestId: "n1", mode: "blocking" });
  expect(opened).not.toHaveProperty("userAgentId");
  expect(f.status(turn.turnId)).toBe("waiting");

  f.answer({
    requestId: "server-1",
    userAgentId: agentId,
    turnId: turn.turnId,
    nativeRequestId: "n1",
    response: { type: "approval", optionId: "allow" },
  });
  await f.hint();
  expect(f.commands.at(-1)).toMatchObject({ type: "respond", requestId: "n1", response: "allow" });
  expect(f.status(turn.turnId)).toBe("running");

  await f.emit(turn.turnId, {
    type: "request.opened",
    requestId: "n2",
    kind: "permission",
    data: permissionRequest,
  });
  await f.advance(10 * 60_000);
  expect(f.commands.at(-1)).toMatchObject({ type: "respond", requestId: "n2", response: "deny" });
  expect(f.closedRequests).toEqual(["delivered", "expired"]);
});

test("a blocking request that the server cannot open is denied at once", async () => {
  const f = await started();
  await f.message();
  const turn = f.turns()[0]!;
  f.outage.openRequest = true;
  await f.emit(turn.turnId, {
    type: "request.opened",
    requestId: "n1",
    kind: "permission",
    data: permissionRequest,
  });
  expect(f.commands.at(-1)).toMatchObject({ type: "respond", requestId: "n1", response: "deny" });
  expect(f.status(turn.turnId)).toBe("running");
});

test("local tools reject calls that do not come from the live attempt of the named turn", async () => {
  const f = await started();
  const sent = await f.message();
  const turn = f.turns()[0]!;
  const input = { objectives: "Ship it.", openWork: "", references: [] };
  const call = (overrides: Partial<LocalToolRequest>) =>
    f.runtime.handleLocalTool({
      tool: "save_handoff",
      organizationId,
      agentId,
      sessionId: sent.sessionId,
      turn: turn.context,
      input,
      ...overrides,
    });
  for (const forged of [
    { turn: { turnId: crypto.randomUUID(), attempt: 1 } },
    { turn: { ...turn.context, attempt: 2 } },
    { sessionId: crypto.randomUUID() },
    { agentId: crypto.randomUUID() },
    { organizationId: "org-2" },
  ])
    expect(await call(forged)).toMatchObject({ success: false, error: { code: "FORBIDDEN" } });
  expect(await call({})).toEqual({ success: true, data: { saved: true } });
  expect(await f.store.handoffs.get(organizationId, sent.sessionId, 0)).toMatchObject({
    objectives: "Ship it.",
  });

  await f.emit(turn.turnId, { type: "turn.completed", result: { status: "completed" } });
  expect(await call({})).toMatchObject({ success: false, error: { code: "FORBIDDEN" } });
});

test("transcripts and runs are read only for turns that ran here", async () => {
  const f = await started();
  await f.message();
  const turn = f.turns()[0]!;
  expect(await f.runtime.turnRuns(crypto.randomUUID())).toEqual([]);
  expect(f.runtime.turnEvents(crypto.randomUUID())).rejects.toThrow("Turn not found.");
  expect(await f.runtime.homedAgents()).toEqual([
    { userAgentId: agentId, liveTurnIds: [turn.turnId] },
  ]);
});

test("the desktop sends a heartbeat every minute, which keeps its leases", async () => {
  const f = await started();
  const beats = () => f.requestPosts.filter((post) => post.method === "heartbeat").length;
  const before = beats();
  await f.heartbeat();
  expect(beats()).toBe(before + 1);
});

test("native output outside our turns is a note on the session's latest turn", async () => {
  const f = await started();
  const sent = await f.message();
  const turn = f.turns()[0]!;
  await f.emit(turn.turnId, { type: "turn.completed", result: { status: "completed" } });
  await f.nativeOutput(sent.sessionId, { type: "text", text: "Done in the background." });
  const notes = await f.store.events.ofKinds(organizationId, turn.turnId, ["note"]);
  expect(notes.map((event) => event.data.text)).toEqual(["Done in the background."]);
});
