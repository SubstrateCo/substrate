import { entities } from "../../core/entities/schema";
import { entityLinks } from "../../core/links/schema";
import { AccessDeniedError, ValidationError } from "../../errors";
import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { taskActivity } from "../activity/schema";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const fixture = setupDatabase();

async function twoProjects() {
  const alice = fixture.forActor(fixture.alice);
  const bob = fixture.forActor(fixture.bob);
  const shared = await alice.projects.create({ name: "Shared" });
  const hidden = await alice.projects.create({ name: "Hidden" });
  await alice.permissions.grant({
    entityId: shared.entityId,
    actorEntityId: fixture.bob,
    level: "edit",
  });
  const open = await alice.tasks.create({ projectEntityId: shared.entityId, title: "Open task" });
  const second = await alice.tasks.create({ projectEntityId: shared.entityId, title: "Second" });
  const secret = await alice.tasks.create({ projectEntityId: hidden.entityId, title: "Secret" });
  return { alice, bob, shared, hidden, open, second, secret };
}

test("a link reads from both tasks and stores one row for each direction rule", async () => {
  const { alice, shared, open, second } = await twoProjects();
  await alice.tasks.addLink(open.entityId, "blocked_by", second.entityId);
  await alice.tasks.addLink(open.entityId, "related_to", second.entityId);
  const [blocks, relates] = await alice.tasks.listLinks(open.entityId);
  expect(blocks).toMatchObject({
    kind: "blocks",
    source: { entityId: second.entityId, title: "Second", projectName: "Shared" },
    target: { entityId: open.entityId },
    blocking: true,
  });
  expect(relates!.kind).toBe("related_to");
  expect(relates!.source!.entityId < relates!.target!.entityId).toBe(true);
  // The same pair, named from the other task, is the same link.
  expect(await rejection(alice.tasks.addLink(second.entityId, "blocks", open.entityId))).toEqual(
    new ValidationError("These tasks already have this link."),
  );
  expect(
    await rejection(alice.tasks.addLink(second.entityId, "related_to", open.entityId)),
  ).toBeInstanceOf(ValidationError);
  expect((await alice.projects.getDetail(shared.entityId)).links.map((link) => link.id)).toEqual([
    blocks!.id,
    relates!.id,
  ]);
});

test("a finished or canceled blocker stops blocking", async () => {
  const { alice, open, second } = await twoProjects();
  await alice.tasks.addLink(second.entityId, "blocks", open.entityId);
  for (const status of ["completed", "canceled"] as const) {
    await alice.tasks.update(second.entityId, { status });
    expect((await alice.tasks.listLinks(open.entityId))[0]!.blocking).toBe(false);
  }
  await alice.tasks.update(second.entityId, { status: "in_review" });
  expect((await alice.tasks.listLinks(open.entityId))[0]!.blocking).toBe(true);
});

test("links reject self links, block cycles, and reversed duplicates", async () => {
  const { alice, shared, open, second } = await twoProjects();
  const third = await alice.tasks.create({ projectEntityId: shared.entityId, title: "Third" });
  expect(
    await rejection(alice.tasks.addLink(open.entityId, "related_to", open.entityId)),
  ).toBeInstanceOf(ValidationError);
  await alice.tasks.addLink(open.entityId, "blocks", second.entityId);
  await alice.tasks.addLink(second.entityId, "blocks", third.entityId);
  expect(await rejection(alice.tasks.addLink(third.entityId, "blocks", open.entityId))).toEqual(
    new ValidationError("This link would make the tasks block each other."),
  );
  expect(
    await rejection(alice.tasks.addLink(open.entityId, "blocked_by", third.entityId)),
  ).toBeInstanceOf(ValidationError);
  await alice.tasks.addLink(open.entityId, "duplicates", second.entityId);
  expect(
    await rejection(alice.tasks.addLink(second.entityId, "duplicates", open.entityId)),
  ).toBeInstanceOf(ValidationError);
  expect(await fixture.db.select().from(entityLinks)).toHaveLength(3);
});

test("adding a link needs edit on the task and view on the other task", async () => {
  const { alice, bob, shared, open, second, secret } = await twoProjects();
  // Bob cannot reach the hidden project from either side.
  expect(
    await rejection(bob.tasks.addLink(open.entityId, "blocks", secret.entityId)),
  ).toBeInstanceOf(AccessDeniedError);
  expect(
    await rejection(bob.tasks.addLink(secret.entityId, "blocks", open.entityId)),
  ).toBeInstanceOf(AccessDeniedError);
  await alice.permissions.grant({
    entityId: shared.entityId,
    actorEntityId: fixture.bob,
    level: "comment",
  });
  expect(
    await rejection(bob.tasks.addLink(open.entityId, "blocks", second.entityId)),
  ).toBeInstanceOf(AccessDeniedError);
  expect(
    await rejection(alice.tasks.addLink(open.entityId, "blocks", second.entityId, secret.entityId)),
  ).toBeInstanceOf(AccessDeniedError);
  expect(
    await rejection(
      fixture
        .forActor(fixture.outsider, fixture.orgB)
        .tasks.addLink(open.entityId, "blocks", second.entityId),
    ),
  ).toBeInstanceOf(AccessDeniedError);
  expect(await fixture.db.select().from(entityLinks)).toEqual([]);
});

test("a reader without access to the other task sees a link with no task details", async () => {
  const { alice, bob, shared, open, secret } = await twoProjects();
  const link = await alice.tasks.addLink(secret.entityId, "blocks", open.entityId);
  const expected = [
    { id: link.id, kind: "blocks", source: null, target: { entityId: open.entityId } },
  ];
  expect(await bob.tasks.listLinks(open.entityId)).toMatchObject(expected);
  expect((await bob.projects.getDetail(shared.entityId)).links).toMatchObject(expected);
  expect((await alice.tasks.listLinks(open.entityId))[0]!.source).toMatchObject({
    title: "Secret",
    projectName: "Hidden",
  });
  // Bob can edit his side, so he can remove the link without seeing the other task.
  await bob.tasks.removeLink(open.entityId, link.id);
  expect(await fixture.db.select().from(entityLinks)).toEqual([]);
});

test("removing a link needs edit on a task the link touches", async () => {
  const { alice, bob, shared, open, second } = await twoProjects();
  const link = await alice.tasks.addLink(open.entityId, "blocks", second.entityId);
  const unrelated = await alice.tasks.create({ projectEntityId: shared.entityId, title: "Other" });
  expect(await rejection(bob.tasks.removeLink(unrelated.entityId, link.id))).toBeInstanceOf(
    AccessDeniedError,
  );
  await alice.permissions.grant({
    entityId: shared.entityId,
    actorEntityId: fixture.bob,
    level: "comment",
  });
  expect(await rejection(bob.tasks.removeLink(open.entityId, link.id))).toBeInstanceOf(
    AccessDeniedError,
  );
  expect(await fixture.db.select().from(entityLinks)).toHaveLength(1);
  await alice.tasks.removeLink(second.entityId, link.id);
  expect(await fixture.db.select().from(entityLinks)).toEqual([]);
});

test("a task's link to a CRM record is not a task relation", async () => {
  const { alice, shared, open } = await twoProjects();
  const contact = await alice.contacts.create({ displayName: "Customer" });
  const link = await alice.links.create({
    entityId: open.entityId,
    otherEntityId: contact.entityId,
  });
  expect(await alice.tasks.listLinks(open.entityId)).toEqual([]);
  expect((await alice.projects.getDetail(shared.entityId)).links).toEqual([]);
  expect(await rejection(alice.tasks.removeLink(open.entityId, link.id))).toBeInstanceOf(
    AccessDeniedError,
  );
  expect(await fixture.db.select().from(entityLinks)).toHaveLength(1);
});

test("link changes add history to both tasks without naming the other task", async () => {
  const { alice, open, second } = await twoProjects();
  const link = await alice.tasks.addLink(open.entityId, "blocks", second.entityId);
  await alice.tasks.removeLink(second.entityId, link.id);
  const history = async (taskEntityId: string) =>
    (
      await fixture.db
        .select()
        .from(taskActivity)
        .where(eq(taskActivity.taskEntityId, taskEntityId))
    )
      .map((row) => row.action)
      .filter((action) => action.startsWith("Link"))
      .sort();
  expect(await history(open.entityId)).toEqual(["Link added: Blocks", "Link removed: Blocks"]);
  expect(await history(second.entityId)).toEqual([
    "Link added: Is blocked by",
    "Link removed: Is blocked by",
  ]);
});

test("a link to a deleted task is hidden and a failed caller transaction keeps no link", async () => {
  const { alice, open, second } = await twoProjects();
  await alice.tasks.addLink(open.entityId, "blocks", second.entityId);
  await fixture.db
    .update(entities)
    .set({ deletedAt: new Date() })
    .where(eq(entities.entityId, second.entityId));
  expect(await alice.tasks.listLinks(open.entityId)).toEqual([]);
  await fixture.db.delete(entityLinks);
  await rejection(
    alice.transaction(async (repos) => {
      const third = await repos.tasks.create({
        projectEntityId: open.projectEntityId,
        title: "Third",
      });
      await repos.tasks.addLink(open.entityId, "related_to", third.entityId);
      throw new Error("rollback");
    }),
  );
  expect(await fixture.db.select().from(entityLinks)).toEqual([]);
});

test("the database rejects links that break the direction rules", async () => {
  const { alice, open, second } = await twoProjects();
  const [low, high] = [open.entityId, second.entityId].sort();
  const row = {
    organizationId: fixture.orgA,
    createdByActorEntityId: fixture.alice,
    relationType: "related_to" as const,
  };
  expect(
    await rejection(
      fixture.db
        .insert(entityLinks)
        .values({ ...row, sourceEntityId: high!, targetEntityId: low! }),
    ),
  ).toBeInstanceOf(Error);
  expect(
    await rejection(
      fixture.db.insert(entityLinks).values({ ...row, sourceEntityId: low!, targetEntityId: low! }),
    ),
  ).toBeInstanceOf(Error);
  expect(await alice.tasks.listLinks(open.entityId)).toEqual([]);
});
