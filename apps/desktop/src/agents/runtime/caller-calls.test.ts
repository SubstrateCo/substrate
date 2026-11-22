import { agentId, organizationId, runtimeFixture, type RuntimeFixture } from "./test-support.ts";
import { afterEach, expect, test } from "bun:test";

let fixture: RuntimeFixture | undefined;
afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

test("rapid caller messages batch without losing their individual invocation authority", async () => {
  const f = (fixture = await runtimeFixture());
  const place = { conversationId: crypto.randomUUID(), threadId: crypto.randomUUID() };
  const first = f.callerMessage({ ...place, body: "Funding" });
  await f.runtime.start();
  await f.advance(200);
  const second = f.callerMessage({ ...place, body: "And investors" });
  await f.runtime.sync();
  await f.advance(400);
  expect(f.turns()).toHaveLength(0);
  await f.advance(200);
  expect(f.turns()).toHaveLength(1);
  const [turn] = f.turns();
  expect(turn!.context.invocationIds?.sort()).toEqual(
    [first.invocationId, second.invocationId].sort(),
  );
  expect(turn!.input.text).toContain("Funding");
  expect(turn!.input.text).toContain("And investors");
});

test("a caller wake runs interactively with the caller author and invocation context", async () => {
  const f = (fixture = await runtimeFixture());
  const call = f.callerMessage({ body: "Find the report" });
  await f.runtime.start();
  await f.advance(600);
  const [turn] = f.turns();
  expect(turn!.mode).toBe("interactive");
  expect(turn!.context.invocationIds).toEqual([call.invocationId]);
  expect(turn!.input.text).toContain('author="Caller"');
  const items = await f.store.inbox.forTurn(organizationId, turn!.turnId);
  expect(items[0]).toMatchObject({ lane: "caller", source: "caller_message" });
});

test("a revoked caller invocation drops even when its message remains visible", async () => {
  const f = (fixture = await runtimeFixture());
  const call = f.callerMessage();
  f.revokedInvocations.add(call.invocationId);
  await f.runtime.start();
  await f.advance(600);
  expect(f.turns()).toEqual([]);
  const [session] = await f.store.sessions.forAgent(organizationId, agentId);
  expect(await f.store.turns.forSessions([session!.id])).toEqual([]);
  expect(await f.store.inbox.openForSessions([session!.id])).toEqual([]);
});

test("a caller steered into a live turn carries its invocation and revoked steers drop", async () => {
  const f = (fixture = await runtimeFixture({ capabilities: { steer: true } }));
  const conversationId = crypto.randomUUID();
  const threadId = crypto.randomUUID();
  f.ownerMessage({ conversationId, threadId });
  await f.runtime.start();
  await f.advance(600);
  const call = f.callerMessage({ conversationId, threadId });
  await f.runtime.sync();
  await f.advance(600);
  expect(f.commands.find((command) => command.type === "steer")).toMatchObject({
    invocationIds: [call.invocationId],
  });
  const revoked = f.callerMessage({ conversationId, threadId });
  f.revokedInvocations.add(revoked.invocationId);
  await f.runtime.sync();
  await f.advance(600);
  expect(f.commands.filter((command) => command.type === "steer")).toHaveLength(1);
  expect(f.turns()).toHaveLength(1);
});

test("a turn with twenty calls holds the next caller for a new turn", async () => {
  const f = (fixture = await runtimeFixture({ capabilities: { steer: true } }));
  const conversationId = crypto.randomUUID();
  const threadId = crypto.randomUUID();
  const calls = Array.from({ length: 20 }, () => f.callerMessage({ conversationId, threadId }));
  await f.runtime.start();
  await f.advance(600);
  const [first] = f.turns();
  expect([...(first!.context.invocationIds ?? [])].sort()).toEqual(
    calls.map((call) => call.invocationId).sort(),
  );
  const next = f.callerMessage({ conversationId, threadId });
  await f.runtime.sync();
  await f.advance(600);
  expect(f.commands.filter((command) => command.type === "steer")).toEqual([]);
  await f.emit(first!.turnId, {
    type: "turn.completed",
    result: { status: "completed", consumedInputIds: first!.input.inputIds },
  });
  await f.advance(600);
  expect(f.turns().at(-1)?.context.invocationIds).toEqual([next.invocationId]);
});
