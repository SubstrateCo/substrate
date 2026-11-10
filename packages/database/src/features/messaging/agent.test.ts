import { ensureUserAgentActor } from "../../core/actors/provisioning";
import { AccessDeniedError } from "../../errors";
import { user, userAgents, messagingMessages } from "../../schema";
import { agentWorkFixture, threadTurn } from "../../testing/agent-work";
import { setupDatabase } from "../../testing/database";
import { createContextService } from "../context/service";
import { createMessagingService } from "./service";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

/* oxlint-disable typescript/await-thenable -- Bun rejection assertions are asynchronous. */
const f = setupDatabase();

test("only the agent's owner sees which turn published an agent reply", async () => {
  const { alice, bob, call } = await agentWorkFixture(f);
  const channel = await alice.createConversation({
    kind: "channel",
    name: "team",
    emails: ["bob@example.com"],
  });
  const root = await alice.sendMessage(channel.id, "Status?");
  const turn = threadTurn(channel.id, root.id);
  const reply = await call("reply", { requestId: crypto.randomUUID(), body: "On track" }, turn);
  const seen = async (reader: typeof alice) =>
    (await reader.listMessages(channel.id, root.id)).find(
      (message) => message.id === reply.messageId,
    );
  expect((await seen(alice))?.originTurnId).toBe(turn.turnId);
  const member = await seen(bob);
  expect(member?.body).toBe("On track");
  expect(member?.originTurnId).toBeNull();
  // The message link target is another view of the same row.
  const target = (userId: string) =>
    createContextService(f.db, { userId, organizationId: f.orgA }).messageTarget(
      channel.id,
      reply.messageId,
    );
  expect((await target("alice")).message.originTurnId).toBe(turn.turnId);
  expect((await target("bob")).message.originTurnId).toBeNull();
});

test("agent messages retain agent authorship and use their owner's conversation access", async () => {
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
  expect(stored).toMatchObject({ authorActorEntityId: actor.entityId });
  expect((await human.listMessages(channel.id))[0]).toMatchObject({
    authorName: "Research",
    authorType: "agent",
    authorExternal: false,
  });
  expect((await chat.sendMessage(channel.id, "agent work", undefined, requestId)).id).toBe(sent.id);
  expect((await chat.sendMessage(privateChannel.id, "owner access")).authorType).toBe("agent");

  const bobsChannel = await createMessagingService(f.db, {
    organizationId: f.orgA,
    userId: "bob",
  }).createConversation({ kind: "channel", name: "bob-only", private: true });
  await expect(chat.sendMessage(bobsChannel.id, "no")).rejects.toBeInstanceOf(AccessDeniedError);
  expect((await chat.listConversations()).map((item) => item.id)).not.toContain(bobsChannel.id);
  await f.db.update(userAgents).set({ enabled: false }).where(eq(userAgents.id, agent!.id));
  await expect(chat.sendMessage(channel.id, "disabled")).rejects.toBeInstanceOf(AccessDeniedError);
});
