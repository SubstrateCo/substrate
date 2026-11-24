import { RepositoryContext } from "../../core/repository-context";
import { member, messageEntityReferences, messagingMessages } from "../../schema";
import { contextConversation } from "../../testing/context";
import { setupDatabase } from "../../testing/database";
import { recordQueries } from "../../testing/queries";
import { linkSummary, listLinkedMessages } from "./links";
import { mcpMessagingQueries } from "./messaging";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();
const alice = { userId: "alice", organizationId: f.orgA };
const byTitle = (items: { title: string }[]) =>
  items.map((item) => item.title).toSorted((a, b) => a.localeCompare(b));

test("record link summaries use a fixed number of queries and count only readable records", async () => {
  const a = f.forActor(f.alice);
  async function accountWithBuyers(count: number) {
    const account = await a.crm.createAccount({ name: `Customer ${count}` });
    for (let index = 0; index < count; index++) {
      const buyer = await a.crm.createAccount({ name: `Buyer ${count}.${index}` });
      await a.links.create({ entityId: account.entityId, otherEntityId: buyer.entityId });
    }
    return account;
  }
  const one = await accountWithBuyers(1);
  const four = await accountWithBuyers(4);
  await a.crm.share(four.entityId, f.bob, "view");
  const tracked = recordQueries();
  const ctx = new RepositoryContext(tracked.db, { organizationId: f.orgA, actorEntityId: f.alice });
  await linkSummary(ctx, alice, one.entityId);
  const singleCount = tracked.queries.length;
  tracked.queries.length = 0;
  const linked = await linkSummary(ctx, alice, four.entityId);
  expect(tracked.queries.length).toBe(singleCount);
  expect(byTitle(linked.records)).toEqual(["Buyer 4.0", "Buyer 4.1", "Buyer 4.2", "Buyer 4.3"]);
  expect(linked.recordCount).toBe(4);
  // Bob can read the account but none of the buyers, so he sees no links and no count.
  const bob = new RepositoryContext(f.db, { organizationId: f.orgA, actorEntityId: f.bob });
  expect(
    await linkSummary(bob, { userId: "bob", organizationId: f.orgA }, four.entityId),
  ).toMatchObject({ records: [], recordCount: 0 });
});

test("thread messages list their readable records with one reference query", async () => {
  const { repos, project, conversation, root, reply } = await contextConversation(f);
  const task = await repos.tasks.create({ projectEntityId: project.entityId, title: "Task" });
  const account = await repos.crm.createAccount({ name: "Customer" });
  const contact = await repos.contacts.createContact({ displayName: "Buyer" });
  const session = await f.forSession("alice");
  for (const id of [project.entityId, task.entityId, account.entityId, contact.entityId])
    await session.context.attach(reply.id, id);
  await session.context.attach(root.id, project.entityId);
  // Alice is a plain member, so Bob's account stays hidden from her.
  await f.db.update(member).set({ role: "member" }).where(eq(member.id, "alice-a"));
  const hidden = await f.forActor(f.bob).crm.createAccount({ name: "Hidden" });
  await f.db.insert(messageEntityReferences).values({
    organizationId: f.orgA,
    conversationId: conversation.id,
    messageId: reply.id,
    entityId: hidden.entityId,
    entityType: "account",
    purpose: "association",
    createdByActorEntityId: f.bob,
  });
  const tracked = recordQueries();
  const ctx = new RepositoryContext(tracked.db, { organizationId: f.orgA, actorEntityId: f.alice });
  const messaging = mcpMessagingQueries(ctx, alice);
  const thread = await messaging.readThread({ messageId: reply.id, limit: 50 });
  expect(thread.root.records).toEqual([
    { type: "project", id: project.entityId, title: "Launch", kind: "attachment" },
  ]);
  expect(byTitle(thread.replies.items[0]!.records)).toEqual([
    "Buyer",
    "Customer",
    "Launch",
    "Task",
  ]);
  expect(
    tracked.queries.filter((query) => query.includes('from "message_entity_references"')),
  ).toHaveLength(1);
  const [top] = (await messaging.readConversation({ conversationId: conversation.id, limit: 20 }))
    .items;
  expect(top?.records).toEqual(thread.root.records);
  await f.db
    .update(messagingMessages)
    .set({ deletedAt: new Date(), body: "" })
    .where(eq(messagingMessages.id, reply.id));
  expect(
    (await messaging.readThread({ messageId: root.id, limit: 50 })).replies.items[0]?.records,
  ).toEqual([]);
});

test("linked message pages follow the cursor and match the summary count", async () => {
  const { project, root, reply } = await contextConversation(f);
  const session = await f.forSession("alice");
  await session.context.attach(root.id, project.entityId);
  await session.context.attach(reply.id, project.entityId);
  const ctx = new RepositoryContext(f.db, { organizationId: f.orgA, actorEntityId: f.alice });
  const input = { target: { type: "project" as const, id: project.entityId }, limit: 1 };
  const first = await listLinkedMessages(ctx, alice, input);
  expect(first.nextCursor).not.toBeNull();
  const second = await listLinkedMessages(ctx, alice, { ...input, cursor: first.nextCursor! });
  expect(second.nextCursor).toBeNull();
  expect([...first.items, ...second.items].map((item) => item.id).toSorted()).toEqual(
    [root.id, reply.id].toSorted(),
  );
  const linked = await linkSummary(ctx, alice, project.entityId);
  expect(linked.messageCount).toBe(2);
  expect(linked.messages.map((item) => item.id)).toEqual([
    ...first.items.map((item) => item.id),
    ...second.items.map((item) => item.id),
  ]);
});
