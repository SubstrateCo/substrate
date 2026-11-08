import { ensureUserAgentActor } from "../../core/actors/provisioning";
import { AccessDeniedError } from "../../errors";
import { user, userAgents, messagingMessages } from "../../schema";
import { setupDatabase } from "../../testing/database";
import { createMessagingService } from "./service";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

/* oxlint-disable typescript/await-thenable -- Bun rejection assertions are asynchronous. */
const f = setupDatabase();

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
  expect(stored).toMatchObject({ authorId: null, authorActorEntityId: actor.entityId });
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
