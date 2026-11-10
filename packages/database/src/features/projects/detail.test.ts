import { entities } from "../../core/entities/schema";
import { member } from "../../core/organizations/schema";
import { AccessDeniedError } from "../../errors";
import { createRepositories } from "../../repositories";
import * as schema from "../../schema";
import { setupDatabase } from "../../testing/database";
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
  const repos = createRepositories(db).forActor({ organizationId: f.orgA, actorEntityId: f.alice });
  const actual = await repos.transaction((tx) => tx.projects.getDetail(project.entityId));
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

/* oxlint-disable typescript/await-thenable -- Bun's rejects matchers return promises at runtime. */
test("project detail denies revoked, deleted, foreign and inactive access", async () => {
  const alice = f.forActor(f.alice);
  const bob = f.forActor(f.bob);
  const project = await alice.projects.create({ name: "Private" });
  const task = await alice.tasks.create({
    projectEntityId: project.entityId,
    title: "Private task",
  });
  await expect(bob.projects.getDetail(project.entityId)).rejects.toBeInstanceOf(AccessDeniedError);
  await alice.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  expect((await bob.projects.getDetail(project.entityId)).level).toBe("view");
  await alice.permissions.revoke({ entityId: project.entityId, actorEntityId: f.bob });
  await expect(bob.tasks.get(task.entityId)).rejects.toBeInstanceOf(AccessDeniedError);
  await expect(bob.projects.getDetail(project.entityId)).rejects.toBeInstanceOf(AccessDeniedError);
  for (const read of [
    () => bob.projects.get(project.entityId),
    () => bob.tasks.list(project.entityId),
  ]) {
    await expect(read()).rejects.toBeInstanceOf(AccessDeniedError);
  }
  await expect(
    f.forActor(f.outsider, f.orgB).projects.getDetail(project.entityId),
  ).rejects.toBeInstanceOf(AccessDeniedError);
  await f.db
    .update(entities)
    .set({ deletedAt: new Date() })
    .where(eq(entities.entityId, project.entityId));
  await expect(alice.projects.getDetail(project.entityId)).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
  const activeProject = await alice.projects.create({ name: "Active" });
  await f.db.update(entities).set({ deletedAt: new Date() }).where(eq(entities.entityId, f.alice));
  await expect(alice.projects.getDetail(activeProject.entityId)).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
  await f.db.update(entities).set({ deletedAt: null }).where(eq(entities.entityId, f.alice));
  await f.db.delete(member).where(eq(member.id, "alice-a"));
  await expect(alice.projects.getDetail(activeProject.entityId)).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
});
