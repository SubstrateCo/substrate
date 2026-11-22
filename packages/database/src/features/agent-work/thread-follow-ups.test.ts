import { agentWakes, agentInvocations } from "../../schema";
import {
  agentWorkFixture,
  callerFixture,
  threadTurn,
  ownerAgentWork,
} from "../../testing/agent-work";
import { ownedAgent } from "../../testing/agents";
import { setupDatabase } from "../../testing/database";
import { createAgentRepository } from "../agents/repository";
import { createMessagingService } from "../messaging/service";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();
const messageWakes = async (id: string) =>
  (await f.db.select().from(agentWakes)).filter(
    (wake) => "messageId" in wake.sourceRef && wake.sourceRef.messageId === id,
  );

test("one human follow-up wakes both admitted participants, but not a mere channel member", async () => {
  const x = await agentWorkFixture(f);
  const second = await ownedAgent(f, "alice");
  const observer = await ownedAgent(f, "alice");
  const channel = await x.alice.createConversation({ kind: "channel", name: "Council" });
  for (const agent of [x.agent, second, observer])
    await x.alice.addAgent(channel.id, agent.agentId);
  const root = await x.alice.sendMessage(
    channel.id,
    `@[agent:${x.agent.actorId}] @[agent:${second.actorId}] Research`,
  );
  const followUp = await x.alice.sendMessage(channel.id, "What about funding?", root.id);
  expect((await messageWakes(followUp.id)).map((wake) => wake.userAgentId).sort()).toEqual(
    [x.agent.agentId, second.agentId].sort(),
  );
  const targeted = await x.alice.sendMessage(
    channel.id,
    `@[agent:${second.actorId}] Investors only`,
    root.id,
  );
  expect((await messageWakes(targeted.id)).map((wake) => wake.userAgentId)).toEqual([
    second.agentId,
  ]);
  const anotherRoot = await x.alice.sendMessage(channel.id, "New topic");
  const unrelated = await x.alice.sendMessage(
    channel.id,
    "Do not activate the council",
    anotherRoot.id,
  );
  expect(await messageWakes(unrelated.id)).toEqual([]);
  const agentReply = await createMessagingService(f.db, x.agentIdentity).sendMessage(
    channel.id,
    `@[agent:${second.actorId}] My findings`,
    root.id,
  );
  expect(await messageWakes(agentReply.id)).toEqual([]);
});

test("published participation survives acknowledged-wake cleanup, and disabling follow-ups still works", async () => {
  const x = await agentWorkFixture(f);
  const channel = await x.alice.createConversation({ kind: "channel", name: "Council" });
  await x.alice.addAgent(channel.id, x.agent.agentId);
  const root = await x.alice.sendMessage(channel.id, `@[agent:${x.agent.actorId}] Research`);
  await x.call(
    "reply",
    { requestId: crypto.randomUUID(), body: "Done" },
    threadTurn(channel.id, root.id),
  );
  await f.db.delete(agentWakes);
  const followUp = await x.alice.sendMessage(channel.id, "And investors?", root.id);
  expect((await messageWakes(followUp.id)).map((wake) => wake.userAgentId)).toEqual([
    x.agent.agentId,
  ]);
  await createAgentRepository(f.db, "alice").saveTriggers({
    agentId: x.agent.agentId,
    triggers: [{ kind: "thread_reply", enabled: false }],
  });
  const disabled = await x.alice.sendMessage(channel.id, "Another follow-up", root.id);
  expect(await messageWakes(disabled.id)).toEqual([]);
});

test("caller follow-ups require participation and fresh owner approval, not a pending mention", async () => {
  const x = await callerFixture(f);
  await x.policy("ask");
  const root = await x.bob.sendMessage(x.channel.id, `${x.mention} Research`);
  const premature = await x.bob.sendMessage(x.channel.id, "And investors?", root.id);
  expect(
    await f.db.select().from(agentInvocations).where(eq(agentInvocations.messageId, premature.id)),
  ).toEqual([]);
  const [held] = await f.db
    .select()
    .from(agentInvocations)
    .where(eq(agentInvocations.messageId, root.id));
  const owner = await ownerAgentWork(f.db, x.owner);
  await owner.decideInvocation(held!.id, "approve");
  const followUp = await x.carol.sendMessage(x.channel.id, "And investors?", root.id);
  const [call] = await f.db
    .select()
    .from(agentInvocations)
    .where(eq(agentInvocations.messageId, followUp.id));
  expect(call).toMatchObject({
    userAgentId: x.agent.agentId,
    kind: "thread_reply",
    status: "pending_approval",
  });
  expect(
    (await f.db.select().from(agentWakes)).filter(
      (wake) => "invocationId" in wake.sourceRef && wake.sourceRef.invocationId === call?.id,
    ),
  ).toEqual([]);
});
