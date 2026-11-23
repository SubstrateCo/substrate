import { AccessDeniedError, ValidationError } from "../../errors";
import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { projects } from "./schema";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();

async function archivedState(projectEntityId: string) {
  const [row] = await f.db
    .select({ at: projects.archivedAt, by: projects.archivedByActorEntityId })
    .from(projects)
    .where(eq(projects.entityId, projectEntityId));
  return row!;
}

test("project owners and organization admins archive and restore; editors and outsiders cannot", async () => {
  const alice = f.forActor(f.alice);
  const bob = f.forActor(f.bob);
  // Bob owns his project; Alice is an organization owner without a grant on it.
  const owned = await bob.projects.create({ name: "Bob's" });
  await alice.projects.archive(owned.entityId);
  expect(await archivedState(owned.entityId)).toMatchObject({ by: f.alice });
  expect((await archivedState(owned.entityId)).at).toBeInstanceOf(Date);
  // A repeated archive keeps the first archive's record.
  await bob.projects.archive(owned.entityId);
  expect((await archivedState(owned.entityId)).by).toBe(f.alice);
  await bob.projects.restore(owned.entityId);
  expect(await archivedState(owned.entityId)).toEqual({ at: null, by: null });

  const shared = await alice.projects.create({ name: "Shared" });
  await alice.permissions.grant({ entityId: shared.entityId, actorEntityId: f.bob, level: "edit" });
  expect(await rejection(bob.projects.archive(shared.entityId))).toBeInstanceOf(AccessDeniedError);
  const outsider = f.forActor(f.outsider, f.orgB);
  expect(await rejection(outsider.projects.archive(shared.entityId))).toBeInstanceOf(
    AccessDeniedError,
  );
  await alice.projects.archive(shared.entityId);
  expect(await rejection(bob.projects.restore(shared.entityId))).toBeInstanceOf(AccessDeniedError);
  expect((await archivedState(shared.entityId)).by).toBe(f.alice);
});

test("only an archived project can be deleted", async () => {
  const bob = f.forActor(f.bob);
  const project = await bob.projects.create({ name: "Old" });
  const task = await bob.tasks.create({ projectEntityId: project.entityId, title: "Kept" });
  expect(await rejection(bob.projects.delete(project.entityId))).toBeInstanceOf(ValidationError);
  expect((await bob.projects.get(project.entityId)).entityId).toBe(project.entityId);
  await bob.projects.archive(project.entityId);
  await bob.projects.delete(project.entityId);
  expect(await rejection(bob.projects.get(project.entityId))).toBeInstanceOf(AccessDeniedError);
  expect(await rejection(bob.tasks.get(task.entityId))).toBeInstanceOf(AccessDeniedError);
});

test("archived projects are listed apart, with the reader's level", async () => {
  const alice = f.forActor(f.alice);
  const bob = f.forActor(f.bob);
  const active = await alice.projects.create({ name: "Active" });
  const archived = await alice.projects.create({ name: "Archived" });
  await alice.permissions.grant({
    entityId: archived.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  await alice.projects.archive(archived.entityId);
  expect((await alice.projects.list()).map((row) => row.entityId)).toEqual([active.entityId]);
  expect(await alice.projects.list("archived")).toMatchObject([
    { entityId: archived.entityId, level: "owner" },
  ]);
  expect(await bob.projects.list("archived")).toMatchObject([
    { entityId: archived.entityId, level: "view" },
  ]);
  expect((await alice.projects.list("all")).map((row) => row.name)).toEqual(["Active", "Archived"]);
  // A deep link still opens it, with its archive state.
  expect((await bob.projects.getDetail(archived.entityId)).project.archivedAt).toBeInstanceOf(Date);
  expect(await f.forActor(f.outsider, f.orgB).projects.list("archived")).toEqual([]);
});

test("an archived project and its tasks are readable but take no changes until restored", async () => {
  const alice = f.forActor(f.alice);
  const bob = f.forActor(f.bob);
  const project = await alice.projects.create({ name: "Archive" });
  const other = await alice.projects.create({ name: "Other" });
  const task = await alice.tasks.create({ projectEntityId: project.entityId, title: "Done" });
  const otherTask = await alice.tasks.create({ projectEntityId: other.entityId, title: "Live" });
  await alice.projects.archive(project.entityId);

  const writes = [
    () => alice.projects.update(project.entityId, { name: "Renamed", description: "" }),
    () => alice.projects.share(project.entityId, f.bob, "view"),
    () => alice.projects.revoke(project.entityId, f.bob),
    () => alice.tasks.create({ projectEntityId: project.entityId, title: "New" }),
    () => alice.tasks.update(task.entityId, { title: "Renamed" }),
    () => alice.tasks.delete(task.entityId, project.entityId),
    () => alice.tasks.move(task.entityId, project.entityId, other.entityId, null),
    () => alice.tasks.move(otherTask.entityId, other.entityId, project.entityId, null),
    () => alice.tasks.addLink(otherTask.entityId, "blocks", task.entityId),
    () => alice.tasks.addLink(task.entityId, "blocks", otherTask.entityId),
  ];
  for (const write of writes)
    expect(await rejection(write())).toMatchObject({
      constructor: ValidationError,
      message: "Restore the project first.",
    });
  // A reader without access learns nothing about the archive.
  expect(await rejection(bob.tasks.update(task.entityId, { title: "Nope" }))).toBeInstanceOf(
    AccessDeniedError,
  );
  expect(
    await rejection(bob.projects.update(project.entityId, { name: "Nope", description: "" })),
  ).toBeInstanceOf(AccessDeniedError);

  expect((await alice.tasks.get(task.entityId)).title).toBe("Done");
  expect((await alice.projects.getDetail(project.entityId)).tasks).toMatchObject([
    { entityId: task.entityId },
  ]);

  await alice.projects.restore(project.entityId);
  expect((await alice.tasks.update(task.entityId, { title: "Reopened" })).title).toBe("Reopened");
});

test("archived task discussions and linked messages are read-only", async () => {
  await f.verifyEmails();
  const alice = f.forActor(f.alice);
  const project = await alice.projects.create({ name: "Discussed" });
  const task = await alice.tasks.create({ projectEntityId: project.entityId, title: "Talk" });
  const quiet = await alice.tasks.create({ projectEntityId: project.entityId, title: "Quiet" });
  const id = await alice.tasks.ensureDiscussion(task.entityId);
  const comment = await f.messaging("alice").sendMessage(id, "Before archive");
  const channel = await f
    .messaging("alice")
    .createConversation({ kind: "channel", name: "general" });
  const message = await f.messaging("alice").sendMessage(channel.id, "Outside note");
  await alice.projects.archive(project.entityId);

  const writes = [
    () => f.messaging("alice").sendMessage(id, "After archive"),
    () => f.messaging("alice").editMessage(comment.id, "Edited"),
    () => f.messaging("alice").deleteMessage(comment.id),
    () => f.messaging("alice").toggleReaction(comment.id, "👍"),
    () => f.context("alice").attach(message.id, task.entityId),
    () => f.context("alice").attach(message.id, project.entityId),
    () => alice.tasks.ensureDiscussion(quiet.entityId),
  ];
  for (const write of writes)
    expect(await rejection(write())).toMatchObject({ message: "Restore the project first." });

  // Existing comments and the discussion stay readable.
  expect(await alice.tasks.ensureDiscussion(task.entityId)).toBe(id);
  expect((await f.messaging("alice").listMessages(id)).map((row) => row.body)).toEqual([
    "Before archive",
  ]);
  const conversations = await f.messaging("alice").listConversations(id);
  expect(conversations.find((row) => row.id === id)).toMatchObject({ canPost: false });
  // Search still finds archived work, but not as a target for changes.
  expect(
    (await f.context("alice").search({ kind: "task", query: "Talk" })).map((row) => row.id),
  ).toEqual([task.entityId]);
  expect(await f.context("alice").search({ kind: "task", query: "Talk", editable: true })).toEqual(
    [],
  );
});
