import { setupDatabase } from "../../testing/database";
import { expect, test } from "bun:test";

const f = setupDatabase();

test("home work is personal, readable, live, and ordered by due date", async () => {
  const alice = f.forActor(f.alice);
  const project = await alice.projects.create({ name: "Launch" });
  const early = await alice.tasks.create({
    projectEntityId: project.entityId,
    title: "Overdue",
    dueDate: "2026-11-01",
    assigneeActorEntityId: f.alice,
  });
  const later = await alice.tasks.create({
    projectEntityId: project.entityId,
    title: "Upcoming",
    dueDate: "2026-11-25",
    assigneeActorEntityId: f.alice,
  });
  await alice.tasks.create({ projectEntityId: project.entityId, title: "Unassigned" });
  await alice.tasks.create({
    projectEntityId: project.entityId,
    title: "Done",
    status: "completed",
    assigneeActorEntityId: f.alice,
  });
  const deleted = await alice.tasks.create({
    projectEntityId: project.entityId,
    title: "Deleted",
    assigneeActorEntityId: f.alice,
  });
  await alice.tasks.delete(deleted.entityId, project.entityId);
  expect((await alice.tasks.home()).map((item) => item.entityId)).toEqual([
    early.entityId,
    later.entityId,
  ]);
  expect(await f.forActor(f.bob).tasks.home()).toEqual([]);
  await alice.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  expect(await f.forActor(f.bob).tasks.home()).toEqual([]);
  await alice.tasks.create({
    projectEntityId: project.entityId,
    title: "Bob’s work",
    assigneeActorEntityId: f.bob,
  });
  expect((await f.forActor(f.bob).tasks.home()).map((item) => item.title)).toEqual(["Bob’s work"]);
  await alice.projects.revoke(project.entityId, f.bob);
  expect(await f.forActor(f.bob).tasks.home()).toEqual([]);
  expect(await f.forActor(f.outsider, f.orgB).tasks.home()).toEqual([]);
});
