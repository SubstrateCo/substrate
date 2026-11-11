import { entities } from "../../core/entities/schema";
import { member } from "../../core/organizations/schema";
import { AccessDeniedError } from "../../errors";
import { ActorRepositories } from "../../repositories";
import * as schema from "../../schema";
import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";

const f = setupDatabase();

test("project detail preserves protected output with five SELECT statements", async () => {
  const alice = f.forActor(f.alice);
  const project = await alice.projects.create({ name: "Detail" });
  const visible = await alice.tasks.create({ projectEntityId: project.entityId, title: "Visible" });
  const child = await alice.tasks.create({
    projectEntityId: project.entityId,
    parentTaskEntityId: visible.entityId,
    title: "Child",
  });
  const other = await alice.projects.create({ name: "Other" });
  await alice.tasks.create({ projectEntityId: other.entityId, title: "Other project" });
  const deleted = await alice.tasks.create({ projectEntityId: project.entityId, title: "Deleted" });
  await f.db
    .update(entities)
    .set({ deletedAt: new Date() })
    .where(eq(entities.entityId, deleted.entityId));
  const statements: string[] = [];
  const db = drizzle(f.db.$client, {
    schema,
    logger: { logQuery: (query) => statements.push(query) },
  });
  const repos = new ActorRepositories(db, { organizationId: f.orgA, actorEntityId: f.alice });
  const { result: actual } = await repos.transaction((tx) =>
    tx.projects.getDetail(project.entityId),
  );
  // Detail performs one access check, reducing its budget from six reads to five.
  expect(statements.filter((query) => /^(select|with)\b/i.test(query))).toHaveLength(5);
  expect(actual.project).toEqual(await alice.projects.get(project.entityId));
  expect(actual.level).toBe("owner");
  expect(actual.tasks.map((task) => task.entityId)).toEqual(
    [visible.entityId, child.entityId].sort(),
  );
  expect(actual.actors.map((actor) => actor.entityId)).toEqual([f.alice, f.bob]);
  expect(actual.members).toEqual([
    { actorEntityId: f.alice, name: "Alice", image: null, type: "human", level: "owner" },
  ]);
});

test("project detail denies revoked, deleted, foreign and inactive access", async () => {
  const alice = f.forActor(f.alice);
  const bob = f.forActor(f.bob);
  const project = await alice.projects.create({ name: "Private" });
  const task = await alice.tasks.create({
    projectEntityId: project.entityId,
    title: "Private task",
  });
  expect(await rejection(bob.projects.getDetail(project.entityId))).toBeInstanceOf(
    AccessDeniedError,
  );
  await alice.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  expect((await bob.projects.getDetail(project.entityId)).level).toBe("view");
  await alice.permissions.revoke({ entityId: project.entityId, actorEntityId: f.bob });
  expect(await rejection(bob.tasks.get(task.entityId))).toBeInstanceOf(AccessDeniedError);
  expect(await rejection(bob.projects.getDetail(project.entityId))).toBeInstanceOf(
    AccessDeniedError,
  );
  for (const read of [
    () => bob.projects.get(project.entityId),
    () => bob.tasks.list(project.entityId),
  ]) {
    expect(await rejection(read())).toBeInstanceOf(AccessDeniedError);
  }
  expect(
    await rejection(f.forActor(f.outsider, f.orgB).projects.getDetail(project.entityId)),
  ).toBeInstanceOf(AccessDeniedError);
  await f.db
    .update(entities)
    .set({ deletedAt: new Date() })
    .where(eq(entities.entityId, project.entityId));
  expect(await rejection(alice.projects.getDetail(project.entityId))).toBeInstanceOf(
    AccessDeniedError,
  );
  const activeProject = await alice.projects.create({ name: "Active" });
  await f.db.update(entities).set({ deletedAt: new Date() }).where(eq(entities.entityId, f.alice));
  expect(await rejection(alice.projects.getDetail(activeProject.entityId))).toBeInstanceOf(
    AccessDeniedError,
  );
  await f.db.update(entities).set({ deletedAt: null }).where(eq(entities.entityId, f.alice));
  await f.db.delete(member).where(eq(member.id, "alice-a"));
  expect(await rejection(alice.projects.getDetail(activeProject.entityId))).toBeInstanceOf(
    AccessDeniedError,
  );
});
