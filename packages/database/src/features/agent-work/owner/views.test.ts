import { sessionKeys } from "@substrate/contracts/agent-work";

import { AccessDeniedError, ValidationError } from "../../../errors";
import { agentTurns } from "../../../schema";
import { hostWork, ownerAgentWork } from "../../../testing/agent-work";
import { setupDatabase } from "../../../testing/database";
import { hostFixture } from "../../../testing/host";
import { rejection } from "../../../testing/rejection";
import { insertTurn } from "../../../testing/turns";
import { executeAgentTool } from "../../mcp/execution";
import { activityPageSize } from "./views";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();

async function views() {
  const x = await hostFixture(f);
  const owner = await ownerAgentWork(f.db, x.owner);
  const bobWork = await ownerAgentWork(f.db, { userId: "bob", organizationId: f.orgA });
  return { ...x, owner, bobWork };
}

test("a turn's outputs are the replies and requests it made; the conversation shows its work", async () => {
  const x = await views();
  await x.alice.sendMessage(x.dm.id, "Ask me something");
  const [claimed] = await x.claim();
  const host = await hostWork(f.db, x.agent.identity);
  await host.start(claimed!.turn.id, { attempt: 1, droppedItemIds: [] });
  const reply = await executeAgentTool(
    f.db,
    { ...x.agentIdentity, installationId: x.agent.identity.installationId },
    "reply",
    {
      requestId: crypto.randomUUID(),
      body: "Which one?",
      ask: { question: "Which one?", options: [{ label: "A" }, { label: "B" }] },
    },
    { turnId: claimed!.turn.id, attempt: 1 },
  );
  if ("pending" in reply.result) throw new Error("The reply waits for approval.");
  const output = reply.result.output;
  const turn = await x.owner.turn(claimed!.turn.id);
  expect(turn.outputs.map(({ kind, id }) => ({ kind, id }))).toEqual([
    { kind: "message", id: output.messageId },
    { kind: "request", id: output.questionId! },
  ]);
  expect(turn).toMatchObject({ status: "running", placeVisible: true, sessionKind: "dm" });
  await x.alice.sendMessage(x.dm.id, "And then");
  const work = await x.owner.conversationWork(x.dm.id);
  expect(work.sessions.map((session) => [session.key, session.placeVisible])).toEqual([
    [sessionKeys.dm(x.dm.id), true],
  ]);
  expect(work.turns.map((row) => row.id)).toEqual([claimed!.turn.id]);
  expect(work.items.map((item) => [item.source, item.status])).toEqual([
    ["owner_message", "submitted"],
    ["owner_message", "pending"],
  ]);
  // Another person sees none of it, and none of Alice's turns.
  expect(await rejection(x.bobWork.conversationWork(x.dm.id))).toBeInstanceOf(AccessDeniedError);
  expect(await rejection(x.bobWork.turn(claimed!.turn.id))).toBeInstanceOf(AccessDeniedError);
  expect(await rejection(x.bobWork.agentActivity(x.agent.agentId))).toBeInstanceOf(
    AccessDeniedError,
  );
});

test("activity pages through the agent's turns, newest first; the first page has its sessions", async () => {
  const x = await views();
  const spec = { key: sessionKeys.dm(x.dm.id), kind: "interactive" as const, origin: null };
  const ids: string[] = [];
  for (let index = 0; index <= activityPageSize; index++) {
    const turn = await insertTurn(f.db, x.agent, spec);
    // Distinct times, so the expected order is the creation order reversed.
    await f.db
      .update(agentTurns)
      .set({ createdAt: new Date(Date.now() - (activityPageSize - index) * 1000) })
      .where(eq(agentTurns.id, turn.id));
    ids.push(turn.id);
  }
  const first = await x.owner.agentActivity(x.agent.agentId);
  expect(first.turns.map((turn) => turn.id)).toEqual(ids.slice(1).reverse());
  expect(first.sessions.map((session) => session.key)).toEqual([sessionKeys.dm(x.dm.id)]);
  const second = await x.owner.agentActivity(x.agent.agentId, first.nextCursor!);
  expect(second).toEqual({
    sessions: [],
    helpers: [],
    turns: [expect.anything()],
    nextCursor: null,
  });
  expect(second.turns[0]!.id).toBe(ids[0]!);
  expect(await rejection(x.owner.agentActivity(x.agent.agentId, "nope"))).toBeInstanceOf(
    ValidationError,
  );
});

test("work in a place the owner cannot open keeps its state but hides its place and text", async () => {
  const x = await views();
  const hidden = await x.bob.createConversation({
    kind: "channel",
    name: "bob-only",
    private: true,
  });
  const root = await x.bob.sendMessage(hidden.id, "Secret plan");
  const place = { conversationId: hidden.id, threadId: root.id };
  const turn = await insertTurn(f.db, x.agent, {
    key: sessionKeys.thread(root.id),
    kind: "interactive",
    origin: place,
  });
  await f.db
    .update(agentTurns)
    .set({
      activity: "Reading the secret plan",
      error: "Quoted: secret plan",
      sourceMessages: [{ ...place, messageId: root.id, createdAt: root.createdAt.toISOString() }],
    })
    .where(eq(agentTurns.id, turn.id));
  const activity = await x.owner.agentActivity(x.agent.agentId);
  expect(activity.sessions).toEqual([
    expect.objectContaining({ key: null, origin: null, placeVisible: false, kind: "thread" }),
  ]);
  expect(activity.turns).toEqual([
    expect.objectContaining({
      id: turn.id,
      status: "running",
      activity: null,
      error: null,
      sourceMessages: [],
      placeVisible: false,
    }),
  ]);
});
