import { entities } from "../../core/entities/schema";
import { RepositoryContext } from "../../core/repository-context";
import { messagingMessages } from "../../schema";
import { contextConversation } from "../../testing/context";
import { setupDatabase } from "../../testing/database";
import { mcpSearchQueries } from "./search";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();

function searchAs(userId: "alice" | "bob") {
  const ctx = new RepositoryContext(f.db, {
    organizationId: f.orgA,
    actorEntityId: userId === "alice" ? f.alice : f.bob,
  });
  return mcpSearchQueries(ctx, { userId, organizationId: f.orgA });
}
const ids = (page: { items: { id: string }[] }) => page.items.map((item) => item.id);

test("name search matches any part of a title; content search matches words and word starts", async () => {
  const { repos, project, chat, conversation } = await contextConversation(f);
  const task = await repos.tasks.create({
    projectEntityId: project.entityId,
    title: "Prepare Launchpad",
    description: "The deploy failed twice.",
  });
  const message = await chat.sendMessage(conversation.id, "Why the deploy failed");
  await (await f.forSession("alice")).context.attach(message.id, task.entityId);
  const search = searchAs("alice");
  expect(ids(await search.names({ query: "unchpa", limit: 20 }))).toEqual([task.entityId]);
  expect(ids(await search.content({ query: "unchpa", limit: 20 }))).toEqual([]);
  expect(ids(await search.content({ query: "launchp", limit: 20 }))).toEqual([task.entityId]);
  expect(ids(await search.names({ query: "deploy", limit: 20 }))).toEqual([]);
  const content = await search.content({ query: "deplo fail", limit: 20 });
  expect(ids(content).toSorted()).toEqual([task.entityId, message.id].toSorted());
  expect(content.items.find((item) => item.type === "message")).toMatchObject({
    conversationId: conversation.id,
    threadId: null,
    author: { id: f.alice, kind: "owner" },
    text: "Why the deploy failed",
    truncated: false,
    records: [{ type: "task", id: task.entityId, title: "Prepare Launchpad", kind: "attachment" }],
  });
});

test("search merges every type newest first, and pages do not overlap", async () => {
  const { repos, project, chat } = await contextConversation(f);
  const task = await repos.tasks.create({ projectEntityId: project.entityId, title: "Alpha one" });
  const other = await repos.projects.create({ name: "Alpha two" });
  const channel = await chat.createConversation({ kind: "channel", name: "Alpha three" });
  const message = await chat.sendMessage(channel.id, "Kickoff");
  for (const [entityId, updatedAt] of [
    [task.entityId, "2026-01-03T00:00:00Z"],
    [other.entityId, "2026-01-02T00:00:00Z"],
  ] as const)
    await f.db
      .update(entities)
      .set({ updatedAt: new Date(updatedAt) })
      .where(eq(entities.entityId, entityId));
  await f.db
    .update(messagingMessages)
    .set({ createdAt: new Date("2026-01-01T00:00:00Z") })
    .where(eq(messagingMessages.id, message.id));
  const search = searchAs("alice");
  const first = await search.names({ query: "Alpha", limit: 2 });
  expect(first.items.map((item) => item.type)).toEqual(["task", "project"]);
  expect(first.items[0]).toMatchObject({ updatedAt: "2026-01-03T00:00:00.000Z" });
  const second = await search.names({ query: "Alpha", limit: 2, cursor: first.nextCursor! });
  expect(second.items).toMatchObject([
    {
      type: "conversation",
      id: channel.id,
      kind: "channel",
      lastActivityAt: "2026-01-01T00:00:00.000Z",
    },
  ]);
  expect(second.nextCursor).toBeNull();
  expect(ids(await search.names({ query: "Alpha", type: "project", limit: 20 }))).toEqual([
    other.entityId,
  ]);
});

test("pages break equal times by ID and do not repeat a record that changes between pages", async () => {
  const { repos, project } = await contextConversation(f);
  const created = [
    await repos.tasks.create({ projectEntityId: project.entityId, title: "Beta one" }),
    await repos.tasks.create({ projectEntityId: project.entityId, title: "Beta two" }),
    await repos.projects.create({ name: "Beta three" }),
  ];
  // Tasks and the project share one time, so only the ID orders them.
  for (const { entityId } of created)
    await f.db
      .update(entities)
      .set({ updatedAt: new Date("2026-02-01T00:00:00Z") })
      .where(eq(entities.entityId, entityId));
  const search = searchAs("alice");
  const first = await search.names({ query: "Beta", limit: 1 });
  // The first result changes after the agent read it. Offset pages would show it again.
  await f.db
    .update(entities)
    .set({ updatedAt: new Date("2026-03-01T00:00:00Z") })
    .where(eq(entities.entityId, first.items[0]!.id));
  const second = await search.names({ query: "Beta", limit: 1, cursor: first.nextCursor! });
  const third = await search.names({ query: "Beta", limit: 1, cursor: second.nextCursor! });
  expect(third.nextCursor).toBeNull();
  const seen = [first, second, third].flatMap(ids);
  expect(seen.toSorted()).toEqual(created.map((row) => row.entityId).toSorted());
  // The rest keep the tie order: ID, newest first.
  expect(seen.slice(1)).toEqual(
    created
      .flatMap((row) => (row.entityId === seen[0] ? [] : [row.entityId]))
      .toSorted()
      .toReversed(),
  );
});

test("search leaves out records, conversations and messages the reader cannot see", async () => {
  const { reply } = await contextConversation(f);
  // Alice's project and private channel are not shared with Bob.
  const bob = searchAs("bob");
  expect((await bob.names({ query: "Launch", limit: 20 })).items).toEqual([]);
  expect((await bob.names({ query: "Private", limit: 20 })).items).toEqual([]);
  expect((await bob.content({ query: "Specific", limit: 20 })).items).toEqual([]);
  const alice = searchAs("alice");
  expect(ids(await alice.content({ query: "Specific", limit: 20 }))).toEqual([reply.id]);
  await f.db
    .update(messagingMessages)
    .set({ deletedAt: new Date(), body: "" })
    .where(eq(messagingMessages.id, reply.id));
  expect((await alice.content({ query: "Specific", limit: 20 })).items).toEqual([]);
});
