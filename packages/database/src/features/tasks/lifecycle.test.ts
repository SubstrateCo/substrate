import { ensureUserAgentActor } from "../../core/actors/provisioning";
import { userAgents } from "../../core/actors/user-agents.schema";
import { entities } from "../../core/entities/schema";
import { AccessDeniedError, ConflictError, ValidationError } from "../../errors";
import { ActorRepositories } from "../../repositories";
import { setupDatabase } from "../../testing/database";
import { recordQueries } from "../../testing/queries";
import { rejection } from "../../testing/rejection";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();

async function tree() {
  const repos = f.forActor(f.alice);
  const project = await repos.projects.create({ name: "Source" });
  const task = await repos.tasks.create({ projectEntityId: project.entityId, title: "Parent" });
  const child = await repos.tasks.create({
    projectEntityId: project.entityId,
    parentTaskEntityId: task.entityId,
    title: "Child",
  });
  return { repos, project, task, child };
}

test("deleting a task deletes its subtree, not its siblings, and denies readers", async () => {
  const { repos, project, task, child } = await tree();
  const sibling = await repos.tasks.create({ projectEntityId: project.entityId, title: "Sibling" });
  await repos.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  expect(
    await rejection(f.forActor(f.bob).tasks.delete(task.entityId, project.entityId)),
  ).toBeInstanceOf(AccessDeniedError);
  await repos.tasks.delete(task.entityId, project.entityId);
  expect(await repos.tasks.list(project.entityId)).toEqual([sibling]);
  for (const id of [task.entityId, child.entityId])
    expect(await rejection(repos.tasks.get(id))).toBeInstanceOf(AccessDeniedError);
});

test("project deletion hides its tasks even from organization admins", async () => {
  const { repos, project, task } = await tree();
  await repos.projects.delete(project.entityId);
  expect(await repos.projects.list()).toEqual([]);
  expect(await rejection(repos.tasks.get(task.entityId))).toBeInstanceOf(AccessDeniedError);
  expect(await rejection(repos.projects.getDetail(project.entityId))).toBeInstanceOf(
    AccessDeniedError,
  );
});

test("project access cannot be revoked while the person has assigned tasks", async () => {
  const { repos, project, task } = await tree();
  await repos.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  await repos.tasks.update(task.entityId, { assigneeActorEntityId: f.bob });
  const error = await rejection(repos.projects.revoke(project.entityId, f.bob));
  expect(error).toBeInstanceOf(ValidationError);
  expect(error.message).toContain("Reassign or unassign");
  expect((await f.forActor(f.bob).tasks.get(task.entityId)).assigneeActorEntityId).toBe(f.bob);
  await repos.tasks.update(task.entityId, { assigneeActorEntityId: null });
  await repos.projects.revoke(project.entityId, f.bob);
  expect(await rejection(f.forActor(f.bob).tasks.get(task.entityId))).toBeInstanceOf(
    AccessDeniedError,
  );
});

test("partial updates preserve other edits", async () => {
  const { repos, task } = await tree();
  await repos.tasks.update(task.entityId, { title: "New title" });
  await repos.tasks.update(task.entityId, { status: "completed" });
  expect(await repos.tasks.get(task.entityId)).toMatchObject({
    title: "New title",
    status: "completed",
  });
});

test("unchanged task edits do not write or touch the entity", async () => {
  const { task } = await tree();
  const { db, queries } = recordQueries();
  const repos = new ActorRepositories(db, { organizationId: f.orgA, actorEntityId: f.alice });
  const result = await repos.transaction((tx) =>
    tx.tasks.update(task.entityId, { title: " Parent " }),
  );
  expect(result.result).toEqual(task);
  expect(result.hints).toEqual([]);
  expect(queries.filter((query) => /^(update|insert|delete) /i.test(query))).toEqual([]);
});

test("concurrent assignment and access removal cannot leave an inaccessible assignee", async () => {
  const { repos, project, task } = await tree();
  await repos.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  const results = await Promise.allSettled([
    repos.projects.revoke(project.entityId, f.bob),
    repos.tasks.update(task.entityId, { assigneeActorEntityId: f.bob }),
  ]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  const current = await repos.tasks.get(task.entityId);
  if (current.assigneeActorEntityId) {
    expect((await f.forActor(f.bob).tasks.get(task.entityId)).assigneeActorEntityId).toBe(f.bob);
  } else {
    expect(await rejection(f.forActor(f.bob).tasks.get(task.entityId))).toBeInstanceOf(
      AccessDeniedError,
    );
  }
});

test("a subtask created while its parent is deleted or moved never loses its parent", async () => {
  const { repos, project, task } = await tree();
  const destination = await repos.projects.create({ name: "Destination" });
  const subtask = (title: string) =>
    repos.tasks.create({
      projectEntityId: project.entityId,
      parentTaskEntityId: task.entityId,
      title,
    });
  // Every live task's parent is live and in the same project.
  const expectWholeTrees = async () => {
    for (const id of [project.entityId, destination.entityId]) {
      const listed = await repos.tasks.list(id);
      const ids = new Set(listed.map((row) => row.entityId));
      for (const row of listed)
        if (row.parentTaskEntityId) expect(ids.has(row.parentTaskEntityId)).toBe(true);
    }
  };
  const moved = await Promise.allSettled([
    repos.tasks.move(task.entityId, project.entityId, destination.entityId, null),
    subtask("During move"),
  ]);
  // The loser gets a domain error, not a foreign-key failure.
  for (const result of moved)
    if (result.status === "rejected")
      expect([ConflictError, ValidationError]).toContain(result.reason.constructor);
  expect(moved.some((result) => result.status === "fulfilled")).toBe(true);
  await expectWholeTrees();

  const current = (await repos.tasks.get(task.entityId)).projectEntityId;
  const deleted = await Promise.allSettled([
    repos.tasks.delete(task.entityId, current),
    repos.tasks.create({
      projectEntityId: current,
      parentTaskEntityId: task.entityId,
      title: "During delete",
    }),
  ]);
  for (const result of deleted)
    if (result.status === "rejected")
      expect([ConflictError, AccessDeniedError]).toContain(result.reason.constructor);
  expect(deleted.some((result) => result.status === "fulfilled")).toBe(true);
  await expectWholeTrees();
});

test("access removal also checks assignments to the person’s agents, but ignores deleted tasks", async () => {
  const { repos, project, task } = await tree();
  await repos.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "edit",
  });
  const [definition] = await f.db
    .insert(userAgents)
    .values({ userId: "bob", name: "Helper", instructions: "Help", harness: "opencode" })
    .returning();
  const agent = await ensureUserAgentActor(f.db, {
    userId: "bob",
    userAgentId: definition!.id,
    organizationId: f.orgA,
  });
  await f.forActor(f.bob).tasks.update(task.entityId, { assigneeActorEntityId: agent.entityId });
  expect(await rejection(repos.projects.revoke(project.entityId, f.bob))).toBeInstanceOf(
    ValidationError,
  );
  await repos.tasks.delete(task.entityId, project.entityId);
  await repos.projects.revoke(project.entityId, f.bob);
  expect(await rejection(f.forActor(f.bob).projects.get(project.entityId))).toBeInstanceOf(
    AccessDeniedError,
  );
});

test("deletion and moves roll back with the caller, including deleted descendants’ containers", async () => {
  const { repos, project, task, child } = await tree();
  const destination = await repos.projects.create({ name: "Destination" });
  await repos.tasks.delete(child.entityId, project.entityId);
  const abort = new Error("Abort lifecycle write");
  expect(
    await rejection(
      repos.transaction(async (tx) => {
        await tx.tasks.move(task.entityId, project.entityId, destination.entityId, null);
        await tx.projects.delete(destination.entityId);
        throw abort;
      }),
    ),
  ).toBe(abort);
  expect((await repos.tasks.get(task.entityId)).projectEntityId).toBe(project.entityId);
  expect((await repos.projects.get(destination.entityId)).name).toBe("Destination");
  await repos.tasks.move(task.entityId, project.entityId, destination.entityId, null);
  const [deletedChild] = await f.db
    .select()
    .from(entities)
    .where(eq(entities.entityId, child.entityId));
  expect(deletedChild).toMatchObject({
    accessEntityId: destination.entityId,
    deletedAt: expect.any(Date),
  });
});

test("moving a subtree keeps its IDs, discussion, and access container aligned", async () => {
  await f.verifyEmails();
  const { repos, project, task, child } = await tree();
  const destination = await repos.projects.create({ name: "Destination" });
  const parent = await repos.tasks.create({
    projectEntityId: destination.entityId,
    title: "New parent",
  });
  const conversationId = await repos.tasks.ensureDiscussion(child.entityId);
  await f.messaging("alice").sendMessage(conversationId, "Keep this message");
  await repos.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  await repos.tasks.move(task.entityId, project.entityId, destination.entityId, parent.entityId);
  expect(await repos.tasks.list(project.entityId)).toEqual([]);
  expect(await repos.tasks.get(task.entityId)).toMatchObject({
    projectEntityId: destination.entityId,
    parentTaskEntityId: parent.entityId,
  });
  expect(await repos.tasks.get(child.entityId)).toMatchObject({
    projectEntityId: destination.entityId,
    parentTaskEntityId: task.entityId,
  });
  expect((await f.messaging("alice").listMessages(conversationId))[0]?.body).toBe(
    "Keep this message",
  );
  expect(await rejection(f.forActor(f.bob).tasks.get(child.entityId))).toBeInstanceOf(
    AccessDeniedError,
  );
  const [entity] = await f.db.select().from(entities).where(eq(entities.entityId, child.entityId));
  expect(entity?.accessEntityId).toBe(destination.entityId);
});

test("a move checks both projects' access in one statement and denies view-only or non-project targets", async () => {
  const { repos, project, task } = await tree();
  const destination = await repos.projects.create({ name: "Destination" });
  for (const id of [project.entityId, destination.entityId])
    await repos.permissions.grant({ entityId: id, actorEntityId: f.bob, level: "edit" });
  const { db, queries } = recordQueries();
  const bob = new ActorRepositories(db, { organizationId: f.orgA, actorEntityId: f.bob });
  await bob.tasks.move(task.entityId, project.entityId, destination.entityId, null);
  // requireAccess-style checks join the scope actor's entity as "actor_entity".
  expect(queries.filter((query) => query.includes('"actor_entity"'))).toHaveLength(1);
  expect((await repos.tasks.get(task.entityId)).projectEntityId).toBe(destination.entityId);
  await repos.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  expect(
    await rejection(
      f.forActor(f.bob).tasks.move(task.entityId, destination.entityId, project.entityId, null),
    ),
  ).toBeInstanceOf(AccessDeniedError);
  expect(
    await rejection(repos.tasks.move(task.entityId, destination.entityId, task.entityId, null)),
  ).toBeInstanceOf(AccessDeniedError);
  expect((await repos.tasks.get(task.entityId)).projectEntityId).toBe(destination.entityId);
});

test("moves reject cycles, inaccessible destinations, wrong parents, and incompatible assignees atomically", async () => {
  const { repos, project, task, child } = await tree();
  const destination = await repos.projects.create({ name: "Destination" });
  expect(
    await rejection(
      repos.tasks.move(task.entityId, project.entityId, project.entityId, child.entityId),
    ),
  ).toBeInstanceOf(ValidationError);
  expect(
    await rejection(
      repos.tasks.move(task.entityId, project.entityId, destination.entityId, child.entityId),
    ),
  ).toBeInstanceOf(ValidationError);
  const foreign = await f.forActor(f.outsider, f.orgB).projects.create({ name: "Foreign" });
  expect(
    await rejection(repos.tasks.move(task.entityId, project.entityId, foreign.entityId, null)),
  ).toBeInstanceOf(AccessDeniedError);
  await repos.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "edit",
  });
  expect(
    await rejection(
      f.forActor(f.bob).tasks.move(task.entityId, project.entityId, destination.entityId, null),
    ),
  ).toBeInstanceOf(AccessDeniedError);
  await repos.tasks.update(child.entityId, { assigneeActorEntityId: f.bob });
  expect(
    await rejection(repos.tasks.move(task.entityId, project.entityId, destination.entityId, null)),
  ).toBeInstanceOf(ValidationError);
  expect((await repos.tasks.get(task.entityId)).projectEntityId).toBe(project.entityId);
  await repos.tasks.update(child.entityId, { assigneeActorEntityId: null });
  await repos.tasks.move(child.entityId, project.entityId, project.entityId, null);
  expect((await repos.tasks.get(child.entityId)).parentTaskEntityId).toBeNull();
});
