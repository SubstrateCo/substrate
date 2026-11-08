import { AccessDeniedError, ValidationError } from "../../errors";
import { agentRunTriggers, agentRuns } from "../../schema";
import { ownedAgent } from "../../testing/agents";
import { setupDatabase } from "../../testing/database";
import { createAgentRepository } from "../agents/repository";
import { createMessagingService } from "../messaging/service";
import { expect, test } from "bun:test";
import { asc, eq } from "drizzle-orm";

/* oxlint-disable typescript/await-thenable -- Bun rejection assertions are asynchronous. */
const f = setupDatabase();

const runs = () =>
  f.db.select().from(agentRuns).orderBy(asc(agentRuns.createdAt), asc(agentRuns.id));
const triggersOf = (runId: string) =>
  f.db
    .select({ messageId: agentRunTriggers.messageId, kind: agentRunTriggers.kind })
    .from(agentRunTriggers)
    .where(eq(agentRunTriggers.runId, runId))
    .orderBy(asc(agentRunTriggers.createdAt));

test("a DM with your agent queues a run per thread and batches messages until it starts", async () => {
  const agent = await ownedAgent(f);
  const alice = createMessagingService(f.db, { organizationId: f.orgA, userId: "alice" });
  const dm = await alice.createConversation({ kind: "dm", agentIds: [agent.agentId] });

  const first = await alice.sendMessage(dm.id, "Summarize the roadmap");
  expect(first.agentRunsQueued).toBe(1);
  const followUp = await alice.sendMessage(dm.id, "Include risks", first.id);
  const [run, ...rest] = await runs();
  expect(rest).toEqual([]);
  expect(run).toMatchObject({
    status: "queued",
    threadId: first.id,
    triggerKind: "direct_message",
    agentActorEntityId: agent.actorId,
    ownerUserId: "alice",
  });
  expect(await triggersOf(run!.id)).toEqual([
    { messageId: first.id, kind: "direct_message" },
    { messageId: followUp.id, kind: "direct_message" },
  ]);

  const other = await alice.sendMessage(dm.id, "Separate question");
  expect((await runs()).map((row) => row.threadId)).toEqual([first.id, other.id]);
  const listed = (await alice.listConversations()).find((row) => row.id === dm.id);
  expect(listed?.name).toBe("Research");
  expect(listed?.members.map((member) => member.type)).toEqual(["human", "agent"]);
});

test("only the owner's own messages trigger the agent", async () => {
  const agent = await ownedAgent(f);
  const alice = createMessagingService(f.db, { organizationId: f.orgA, userId: "alice" });
  const bob = createMessagingService(f.db, { organizationId: f.orgA, userId: "bob" });
  const channel = await alice.createConversation({
    kind: "channel",
    name: "planning",
    private: true,
    emails: ["bob@example.com"],
  });
  await alice.addAgent(channel.id, agent.agentId);
  const mention = `@[agent:${agent.actorId}]`;

  expect((await bob.sendMessage(channel.id, `${mention} do my work`)).agentRunsQueued).toBe(0);
  const asAgent = createMessagingService(f.db, {
    organizationId: f.orgA,
    userId: "alice",
    actorEntityId: agent.actorId,
  });
  expect((await asAgent.sendMessage(channel.id, `${mention} loop`)).agentRunsQueued).toBe(0);
  expect((await alice.sendMessage(channel.id, "no mention")).agentRunsQueued).toBe(0);
  expect(await runs()).toEqual([]);

  const asked = await alice.sendMessage(channel.id, `${mention} draft the brief`);
  expect((await runs()).map((row) => [row.triggerKind, row.threadId])).toEqual([
    ["mention", asked.id],
  ]);
});

test("a thread reply continues the agent's thread, unless the owner disabled that trigger", async () => {
  const agent = await ownedAgent(f);
  const alice = createMessagingService(f.db, { organizationId: f.orgA, userId: "alice" });
  const channel = await alice.createConversation({ kind: "channel", name: "general" });
  await alice.addAgent(channel.id, agent.agentId);
  const root = await alice.sendMessage(channel.id, `@[agent:${agent.actorId}] start`);
  await f.db.update(agentRuns).set({ status: "completed" });

  await alice.sendMessage(channel.id, "and also this", root.id);
  expect((await runs()).map((row) => row.triggerKind)).toEqual(["mention", "thread_reply"]);
  // Replies in other threads do not reach the agent.
  const unrelated = await alice.sendMessage(channel.id, "unrelated");
  expect((await alice.sendMessage(channel.id, "reply", unrelated.id)).agentRunsQueued).toBe(0);

  await f.db.update(agentRuns).set({ status: "completed" });
  await createAgentRepository(f.db, "alice").saveTriggers({
    agentId: agent.agentId,
    triggers: [{ kind: "thread_reply", enabled: false, prompt: null }],
  });
  expect((await alice.sendMessage(channel.id, "one more", root.id)).agentRunsQueued).toBe(0);
});

test("agents must be members to be mentioned, and only their owner adds or removes them", async () => {
  const agent = await ownedAgent(f);
  const alice = createMessagingService(f.db, { organizationId: f.orgA, userId: "alice" });
  const bob = createMessagingService(f.db, { organizationId: f.orgA, userId: "bob" });
  const channel = await alice.createConversation({
    kind: "channel",
    name: "general",
    emails: ["bob@example.com"],
  });
  await expect(
    alice.sendMessage(channel.id, `@[agent:${agent.actorId}] hi`),
  ).rejects.toBeInstanceOf(ValidationError);

  await expect(bob.addAgent(channel.id, agent.agentId)).rejects.toBeInstanceOf(AccessDeniedError);
  await alice.addAgent(channel.id, agent.agentId);
  await expect(bob.removeAgent(channel.id, agent.actorId)).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
  const members = (await bob.listConversations()).find((row) => row.id === channel.id)?.members;
  expect(members?.find((member) => member.actorId === agent.actorId)).toMatchObject({
    type: "agent",
    userId: null,
    name: "Research",
  });

  await alice.removeAgent(channel.id, agent.actorId);
  await expect(
    alice.sendMessage(channel.id, `@[agent:${agent.actorId}] hi`),
  ).rejects.toBeInstanceOf(ValidationError);

  const dm = await alice.createConversation({ kind: "dm", emails: ["bob@example.com"] });
  await expect(alice.addAgent(dm.id, agent.agentId)).rejects.toBeInstanceOf(ValidationError);
});

test("an agent's own posts record authorship but never make it a member", async () => {
  const agent = await ownedAgent(f);
  const alice = createMessagingService(f.db, { organizationId: f.orgA, userId: "alice" });
  const asAgent = createMessagingService(f.db, {
    organizationId: f.orgA,
    userId: "alice",
    actorEntityId: agent.actorId,
  });
  const dm = await alice.createConversation({ kind: "dm", emails: ["bob@example.com"] });
  await asAgent.sendMessage(dm.id, "Summary for you both");
  const members = (await alice.listConversations()).find((row) => row.id === dm.id)?.members;
  expect(members?.map((member) => member.type)).toEqual(["human", "human"]);
  expect((await alice.listMessages(dm.id))[0]).toMatchObject({ authorType: "agent" });

  const channel = await alice.createConversation({ kind: "channel", name: "general" });
  await alice.addAgent(channel.id, agent.agentId);
  await alice.removeAgent(channel.id, agent.actorId);
  await asAgent.sendMessage(channel.id, "Still here?");
  await expect(
    alice.sendMessage(channel.id, `@[agent:${agent.actorId}] hi`),
  ).rejects.toBeInstanceOf(ValidationError);
});

test("a DM needs exactly one other member, person or agent", async () => {
  const agent = await ownedAgent(f);
  const alice = createMessagingService(f.db, { organizationId: f.orgA, userId: "alice" });
  await expect(
    alice.createConversation({
      kind: "dm",
      emails: ["bob@example.com"],
      agentIds: [agent.agentId],
    }),
  ).rejects.toBeInstanceOf(ValidationError);
  const bob = createMessagingService(f.db, { organizationId: f.orgA, userId: "bob" });
  await expect(
    bob.createConversation({ kind: "dm", agentIds: [agent.agentId] }),
  ).rejects.toBeInstanceOf(AccessDeniedError);
});
