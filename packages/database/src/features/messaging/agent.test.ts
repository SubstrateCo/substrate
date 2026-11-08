import { ensureUserAgentActor } from "../../core/actors/provisioning";
import { AccessDeniedError } from "../../errors";
import { user, userAgents, messagingAgentParticipants, messagingMessages } from "../../schema";
import { setupDatabase } from "../../testing/database";
import { recordQueries } from "../../testing/queries";
import { createMessagingService } from "./service";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

/* oxlint-disable typescript/await-thenable -- Bun rejection assertions are asynchronous. */
const f = setupDatabase();

test("adding agents checks ownership and activity for all agents in one statement", async () => {
  await f.db.update(user).set({ emailVerified: true });
  const agent = async (userId: string, name: string) => {
    const [row] = await f.db
      .insert(userAgents)
      .values({ userId, name, instructions: "", harness: "opencode" })
      .returning();
    const actor = await ensureUserAgentActor(f.db, {
      organizationId: f.orgA,
      userId,
      userAgentId: row!.id,
    });
    return { userAgentId: row!.id, actorId: actor.entityId };
  };
  const owned = [
    await agent("alice", "One"),
    await agent("alice", "Two"),
    await agent("alice", "Three"),
  ];
  const foreign = await agent("bob", "Bob's agent");
  const disabled = await agent("alice", "Disabled");
  await f.db
    .update(userAgents)
    .set({ enabled: false })
    .where(eq(userAgents.id, disabled.userAgentId));
  const channel = await createMessagingService(f.db, {
    organizationId: f.orgA,
    userId: "alice",
  }).createConversation({ kind: "channel", name: "agents", private: true });
  const { db, queries } = recordQueries();
  const human = createMessagingService(db, { organizationId: f.orgA, userId: "alice" });
  for (const denied of [foreign, disabled])
    await expect(
      human.addMembers(channel.id, [], [owned[0]!.actorId, denied.actorId]),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  expect(await f.db.select().from(messagingAgentParticipants)).toEqual([]);
  queries.length = 0;
  const ids = owned.map((row) => row.actorId);
  expect(await human.addMembers(channel.id, [], [...ids, ids[0]!])).toEqual({ added: 3 });
  expect(queries).toHaveLength(4);
  expect(await human.addMembers(channel.id, [], ids)).toEqual({ added: 0 });
});

test("agent messages retain agent authorship and cannot use their owner's private conversations", async () => {
  await f.db.update(user).set({ emailVerified: true });
  const [agent] = await f.db
    .insert(userAgents)
    .values({ userId: "alice", name: "Research", instructions: "", harness: "opencode" })
    .returning();
  const actor = await ensureUserAgentActor(f.db, {
    organizationId: f.orgA,
    userId: "alice",
    userAgentId: agent!.id,
  });
  const human = createMessagingService(f.db, { organizationId: f.orgA, userId: "alice" });
  const channel = await human.createConversation({ kind: "channel", name: "general" });
  const privateChannel = await human.createConversation({
    kind: "channel",
    name: "private",
    private: true,
  });
  const chat = createMessagingService(f.db, {
    organizationId: f.orgA,
    userId: "alice",
    actorEntityId: actor.entityId,
  });
  const requestId = crypto.randomUUID();
  const sent = await chat.sendMessage(channel.id, "agent work", undefined, requestId);
  expect(sent.authorType).toBe("agent");
  const [stored] = await f.db
    .select()
    .from(messagingMessages)
    .where(eq(messagingMessages.id, sent.id));
  expect(stored).toMatchObject({ authorId: null, authorActorEntityId: actor.entityId });
  expect((await human.listMessages(channel.id))[0]).toMatchObject({
    authorName: "Research",
    authorType: "agent",
    authorExternal: false,
  });
  expect((await chat.sendMessage(channel.id, "agent work", undefined, requestId)).id).toBe(sent.id);
  await expect(chat.sendMessage(privateChannel.id, "no")).rejects.toBeInstanceOf(AccessDeniedError);
  expect(await human.addMembers(privateChannel.id, [], [actor.entityId])).toEqual({ added: 1 });
  expect((await chat.sendMessage(privateChannel.id, "invited")).authorType).toBe("agent");
  await f.db.update(userAgents).set({ enabled: false }).where(eq(userAgents.id, agent!.id));
  await expect(chat.sendMessage(channel.id, "disabled")).rejects.toBeInstanceOf(AccessDeniedError);
});
