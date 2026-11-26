import { AccessDeniedError, ConflictError } from "../../errors";
import { agentTurns, messagingMessages } from "../../schema";
import { setupDatabase } from "../../testing/database";
import { mcpFixture } from "../../testing/mcp";
import { rejection } from "../../testing/rejection";
import { dmTurn, routineTurn } from "../../testing/turns";
import { executeAgentTool } from "./execution";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();

test("every call, read or write, needs a live server turn of the agent", async () => {
  const x = await mcpFixture(f);
  const caller = { ...x.agentIdentity, installationId: x.agent.identity.installationId };
  const unknown = { turnId: crypto.randomUUID(), attempt: 1 };
  expect(
    await rejection(executeAgentTool(f.db, caller, "list_projects", {}, unknown)),
  ).toBeInstanceOf(AccessDeniedError);
  const turn = dmTurn(x.dm.id);
  expect((await x.call("list_projects", {}, turn)).items).toEqual([]);
});

test("a turn that ended, or continued as a newer attempt, runs no more calls", async () => {
  const x = await mcpFixture(f);
  const caller = { ...x.agentIdentity, installationId: x.agent.identity.installationId };
  const turn = dmTurn(x.dm.id);
  const context = await x.turn(turn);
  const reply = (requestId = crypto.randomUUID()) =>
    executeAgentTool(f.db, caller, "reply", { requestId, body: "Late" }, context);
  await f.db.update(agentTurns).set({ attempt: 2 }).where(eq(agentTurns.id, context.turnId));
  expect(await rejection(reply())).toBeInstanceOf(ConflictError);
  // The new attempt runs.
  await executeAgentTool(
    f.db,
    caller,
    "reply",
    { requestId: crypto.randomUUID(), body: "Resumed" },
    { ...context, attempt: 2 },
  );
  await f.db
    .update(agentTurns)
    .set({ status: "completed", leaseDeviceId: null, leaseExpiresAt: null })
    .where(eq(agentTurns.id, context.turnId));
  for (const call of [
    reply(),
    executeAgentTool(f.db, caller, "list_projects", {}, { ...context, attempt: 2 }),
  ])
    expect(await rejection(call)).toBeInstanceOf(ConflictError);
  expect(
    (
      await f.db
        .select()
        .from(messagingMessages)
        .where(eq(messagingMessages.conversationId, x.dm.id))
    ).map((row) => row.body),
  ).toEqual(["Resumed"]);
});

test("the server turn decides the session, places, mode and handoff, not the host", async () => {
  const x = await mcpFixture(f);
  const channel = await x.alice.createConversation({ kind: "channel", name: "general" });
  // A routine turn has no origin: it posts to its destination, or where reply.to names.
  const routine = routineTurn({ conversationId: channel.id, threadId: null });
  const sent = await x.call("reply", { requestId: crypto.randomUUID(), body: "Weekly" }, routine);
  expect(sent.conversationId).toBe(channel.id);
  const elsewhere = await x.call(
    "reply",
    { requestId: crypto.randomUUID(), body: "Elsewhere", to: { conversationId: x.dm.id } },
    routine,
  );
  expect(elsewhere.conversationId).toBe(x.dm.id);
});

test("a turn leased by another device, or called from one, is refused", async () => {
  const x = await mcpFixture(f);
  const other = { ...dmTurn(x.dm.id), installationId: crypto.randomUUID() };
  expect(await rejection(x.call("list_projects", {}, other))).toBeInstanceOf(AccessDeniedError);
  const bob = {
    ...x.agentIdentity,
    userId: "bob",
    installationId: x.agent.identity.installationId,
  };
  expect(
    await rejection(
      executeAgentTool(f.db, bob, "list_projects", {}, await x.turn(dmTurn(x.dm.id))),
    ),
  ).toBeInstanceOf(AccessDeniedError);
});
