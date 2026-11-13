import { RepositoryContext } from "../../core/repository-context";
import { contextConversation } from "../../testing/context";
import { setupDatabase } from "../../testing/database";
import { recordQueries } from "../../testing/queries";
import { listLinks } from "./links";
import { expect, test } from "bun:test";

const f = setupDatabase();

test("entity link metadata uses a fixed number of queries and omits hidden targets", async () => {
  const a = f.forActor(f.alice);
  const account = await a.crm.createAccount({ name: "Customer" });
  const titles = [];
  for (let index = 0; index < 4; index++) {
    const contact = await a.contacts.createContact({ displayName: `Buyer ${index}` });
    await a.links.create({ entityId: account.entityId, otherEntityId: contact.entityId });
    titles.push(contact.displayName);
  }
  await a.crm.share(account.entityId, f.bob, "view");
  const tracked = recordQueries();
  const ctx = new RepositoryContext(tracked.db, {
    organizationId: f.orgA,
    actorEntityId: f.alice,
  });
  const input = {
    target: { type: "account" as const, id: account.entityId },
    source: "entities" as const,
    limit: 25,
  };
  await listLinks(ctx, { userId: "alice", organizationId: f.orgA }, { ...input, limit: 1 });
  const singleCount = tracked.queries.length;
  tracked.queries.length = 0;
  const page = await listLinks(ctx, { userId: "alice", organizationId: f.orgA }, input);
  expect(tracked.queries.length).toBe(singleCount);
  expect(
    page.items.map((item) => item.entity?.title ?? "").toSorted((a, b) => a.localeCompare(b)),
  ).toEqual(titles.toSorted((a, b) => a.localeCompare(b)));
  const bob = new RepositoryContext(tracked.db, {
    organizationId: f.orgA,
    actorEntityId: f.bob,
  });
  expect((await listLinks(bob, { userId: "bob", organizationId: f.orgA }, input)).items).toEqual(
    [],
  );
});

test("message link metadata batches mixed target types and preserves pagination", async () => {
  const { repos, project, reply } = await contextConversation(f);
  const task = await repos.tasks.create({ projectEntityId: project.entityId, title: "Task" });
  const account = await repos.crm.createAccount({ name: "Customer" });
  const contact = await repos.contacts.createContact({ displayName: "Buyer" });
  const session = await f.forSession("alice");
  for (const id of [project.entityId, task.entityId, account.entityId, contact.entityId])
    await session.context.attach(reply.id, id);
  const tracked = recordQueries();
  const ctx = new RepositoryContext(tracked.db, {
    organizationId: f.orgA,
    actorEntityId: f.alice,
  });
  const identity = { userId: "alice", organizationId: f.orgA };
  const input = {
    target: { type: "message" as const, id: reply.id },
    source: "messages" as const,
    limit: 1,
  };
  const first = await listLinks(ctx, identity, input);
  const singleCount = tracked.queries.length;
  tracked.queries.length = 0;
  const all = await listLinks(ctx, identity, { ...input, limit: 25 });
  expect(tracked.queries.length).toBe(singleCount);
  expect(
    all.items.map((item) => item.work?.title ?? "").toSorted((a, b) => a.localeCompare(b)),
  ).toEqual(["Launch", "Task", "Customer", "Buyer"].toSorted((a, b) => a.localeCompare(b)));
  expect(first.items).toEqual(all.items.slice(0, 1));
  expect(first.nextCursor).not.toBeNull();
  const next = await listLinks(ctx, identity, { ...input, cursor: first.nextCursor! });
  expect(next.items).toEqual(all.items.slice(1, 2));
});
