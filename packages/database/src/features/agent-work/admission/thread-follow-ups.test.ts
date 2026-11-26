import { agentSessions, agentWorkItems } from "../../../schema";
import { agentWorkFixture } from "../../../testing/agent-work";
import { ownedAgent } from "../../../testing/agents";
import { setupDatabase } from "../../../testing/database";
import { threadTurn } from "../../../testing/turns";
import { createAgentRepository } from "../../agents/repository";
import { createMessagingService } from "../../messaging/service";
import { expect, test } from "bun:test";

const f = setupDatabase();
const messageWakes = async (id: string) =>
  (await f.db.select().from(agentWorkItems)).filter(
    (item) => "messageId" in item.sourceRef && item.sourceRef.messageId === id,
  );

test("one human follow-up starts work for both admitted participants, but not a mere channel member", async () => {
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

test("published participation survives without the thread session, and disabling follow-ups still works", async () => {
  const x = await agentWorkFixture(f);
  const channel = await x.alice.createConversation({ kind: "channel", name: "Council" });
  await x.alice.addAgent(channel.id, x.agent.agentId);
  const root = await x.alice.sendMessage(channel.id, `@[agent:${x.agent.actorId}] Research`);
  await x.call(
    "reply",
    { requestId: crypto.randomUUID(), body: "Done" },
    threadTurn(channel.id, root.id),
  );
  // Without its session, the published reply is the evidence that the agent joined.
  await f.db.delete(agentSessions);
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

test("another person's mention or follow-up never starts the owner's agent, even in a joined thread", async () => {
  const x = await agentWorkFixture(f);
  const channel = await x.alice.createConversation({ kind: "channel", name: "Council" });
  await x.alice.addAgent(channel.id, x.agent.agentId);
  const root = await x.alice.sendMessage(channel.id, `@[agent:${x.agent.actorId}] Research`);
  expect(await messageWakes(root.id)).toHaveLength(1);
  const mention = await x.bob.sendMessage(channel.id, `@[agent:${x.agent.actorId}] Hi`);
  const followUp = await x.bob.sendMessage(channel.id, "And investors?", root.id);
  expect(await messageWakes(mention.id)).toEqual([]);
  expect(await messageWakes(followUp.id)).toEqual([]);
});
