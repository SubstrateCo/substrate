import { RepositoryContext } from "../../core/repository-context";
import {
  user,
  userAgents,
  messagingMessages,
  messagingParticipants,
  messageEntityReferences,
} from "../../schema";
import { ownedAgent } from "../../testing/agents";
import { setupDatabase } from "../../testing/database";
import { recordQueries } from "../../testing/queries";
import { listLinkedMessages } from "./links";
import { mcpMessagingQueries } from "./messaging";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();

test("MCP conversation, thread and link authors join current human and agent names", async () => {
  const agent = await ownedAgent(f);
  const human = f.messaging("alice");
  const channel = await human.createConversation({ kind: "channel", name: "Names" });
  const root = await human.sendMessage(channel.id, "Root");
  await f.db.insert(messagingParticipants).values({
    conversationId: channel.id,
    organizationId: f.orgA,
    actorEntityId: agent.actorId,
    actorType: "agent",
  });
  const [reply] = await f.db
    .insert(messagingMessages)
    .values({
      conversationId: channel.id,
      authorOrganizationId: f.orgA,
      authorActorEntityId: agent.actorId,
      body: "Reply",
      threadId: root.id,
    })
    .returning();
  const project = await f.forActor(f.alice).projects.create({ name: "Linked" });
  await f.db.insert(messageEntityReferences).values(
    [root.id, reply!.id].map((messageId) => ({
      organizationId: f.orgA,
      conversationId: channel.id,
      messageId,
      entityId: project.entityId,
      entityType: "project" as const,
      purpose: "association" as const,
      createdByActorEntityId: f.alice,
    })),
  );
  await f.db.update(user).set({ name: "New human name" }).where(eq(user.id, "alice"));
  await f.db
    .update(userAgents)
    .set({ name: "New agent name" })
    .where(eq(userAgents.id, agent.agentId));
  const { db, queries } = recordQueries();
  const ctx = new RepositoryContext(db, { organizationId: f.orgA, actorEntityId: agent.actorId });
  const identity = { organizationId: f.orgA, userId: "alice" };
  const messaging = mcpMessagingQueries(ctx, identity);
  const conversation = await messaging.readConversation({ conversationId: channel.id, limit: 20 });
  expect(conversation.items[0]?.author).toEqual({
    id: f.alice,
    name: "New human name",
    type: "human",
    kind: "owner",
  });
  const thread = await messaging.readThread({ messageId: reply!.id, limit: 20 });
  expect(thread.root.author).toEqual({
    id: f.alice,
    name: "New human name",
    type: "human",
    kind: "owner",
  });
  expect(thread.replies.items[0]?.author).toEqual({
    id: agent.actorId,
    name: "New agent name",
    type: "agent",
    kind: "agent",
  });
  const links = await listLinkedMessages(ctx, identity, {
    target: { type: "project", id: project.entityId },
    limit: 20,
  });
  expect(links.items.map((item) => item.author.name).sort((a, b) => a.localeCompare(b))).toEqual([
    "New agent name",
    "New human name",
  ]);
  const authorQueries = queries.filter(
    (query) => query.includes('left join "user"') && query.includes('left join "user_agents"'),
  );
  expect(authorQueries).toHaveLength(4);
  for (const query of authorQueries) expect(query).not.toMatch(/select\s+dn_(?:user|agent)\./i);
});
