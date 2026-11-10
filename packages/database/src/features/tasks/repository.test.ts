import { entities } from "../../core/entities/schema";
import { entityLinks } from "../../core/links/schema";
import { member } from "../../core/organizations/schema";
import { entityAccessParents } from "../../core/permissions/access-parents";
import { AccessDeniedError, ValidationError } from "../../errors";
import { createRepositories } from "../../repositories";
import * as schema from "../../schema";
import { setupDatabase } from "../../testing/database";
import { taskComments } from "./comments.schema";
import { tasks } from "./tasks.schema";
/* oxlint-disable typescript/await-thenable -- Bun's rejects matchers return promises at runtime. */
import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";

const fixture = setupDatabase();

describe("projects and tasks", () => {
  test("tasks default to not started and reject statuses outside the standard set", async () => {
    const alice = fixture.forActor(fixture.alice);
    const project = await alice.projects.create({ name: "One" });
    const task = await alice.tasks.create({ projectEntityId: project.entityId, title: "Default" });
    expect(task).toMatchObject({ status: "not_started" });
    expect(await alice.tasks.update(task.entityId, { status: "canceled" })).toMatchObject({
      status: "canceled",
    });
    // SAFETY: Deliberately bypass the input type to verify runtime rejection of an invalid status.
    await expect(
      alice.tasks.update(task.entityId, { status: "blocked" as never }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect((await alice.tasks.get(task.entityId)).status).toBe("canceled");
    // SAFETY: Deliberately bypass the column type to verify PostgreSQL rejects an invalid status.
    await expect(
      fixture.db
        .update(tasks)
        .set({ status: "blocked" as never })
        .where(eq(tasks.entityId, task.entityId))
        .execute(),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
  });

  test("project sharing grants tasks and subtasks the same access, and revocation removes it", async () => {
    const alice = fixture.forActor(fixture.alice);
    const bob = fixture.forActor(fixture.bob);
    const project = await alice.projects.create({ name: "Launch" });
    const task = await alice.tasks.create({ projectEntityId: project.entityId, title: "Ship" });
    const child = await alice.tasks.create({
      projectEntityId: project.entityId,
      parentTaskEntityId: task.entityId,
      title: "Review",
    });
    await expect(bob.tasks.get(task.entityId)).rejects.toBeInstanceOf(AccessDeniedError);
    await alice.permissions.grant({
      entityId: project.entityId,
      actorEntityId: fixture.bob,
      level: "view",
    });
    expect((await bob.tasks.list(project.entityId)).map((row) => row.entityId).sort()).toEqual(
      [task.entityId, child.entityId].sort(),
    );
    await expect(bob.tasks.update(task.entityId, { title: "Changed" })).rejects.toBeInstanceOf(
      AccessDeniedError,
    );
    await expect(bob.tasks.addComment(task.entityId, "Hello")).rejects.toBeInstanceOf(
      AccessDeniedError,
    );
    await alice.permissions.grant({
      entityId: project.entityId,
      actorEntityId: fixture.bob,
      level: "comment",
    });
    expect((await bob.tasks.addComment(child.entityId, "Ready")).body).toBe("Ready");
    await alice.permissions.grant({
      entityId: project.entityId,
      actorEntityId: fixture.bob,
      level: "edit",
    });
    expect((await bob.tasks.update(task.entityId, { title: "Changed" })).title).toBe("Changed");
    await alice.permissions.revoke({ entityId: project.entityId, actorEntityId: fixture.bob });
    await expect(bob.tasks.get(child.entityId)).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(bob.tasks.listComments(child.entityId, project.entityId)).rejects.toBeInstanceOf(
      AccessDeniedError,
    );
  });

  test("subtasks belong to one project and assignees require project access", async () => {
    const alice = fixture.forActor(fixture.alice);
    const first = await alice.projects.create({ name: "One" });
    const second = await alice.projects.create({ name: "Two" });
    const task = await alice.tasks.create({
      projectEntityId: first.entityId,
      title: "Review",
      status: "in_review",
      assigneeActorEntityId: fixture.alice,
      priority: "high",
      dueDate: "2026-12-01",
    });
    expect(task).toMatchObject({
      status: "in_review",
      assigneeActorEntityId: fixture.alice,
      priority: "high",
      dueDate: "2026-12-01",
    });
    await expect(
      alice.tasks.create({
        projectEntityId: second.entityId,
        parentTaskEntityId: task.entityId,
        title: "Bad parent",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      alice.tasks.update(task.entityId, { assigneeActorEntityId: fixture.outsider }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(
      alice.tasks.update(task.entityId, { dueDate: "2026-02-31" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(alice.tasks.update(task.entityId, { title: " " })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  test("organization isolation and safe links apply to project tasks", async () => {
    const alice = fixture.forActor(fixture.alice);
    const outsider = fixture.forActor(fixture.outsider, fixture.orgB);
    const project = await alice.projects.create({ name: "Private" });
    const task = await alice.tasks.create({ projectEntityId: project.entityId, title: "Secret" });
    expect(await outsider.projects.list()).toEqual([]);
    await expect(outsider.tasks.get(task.entityId)).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(
      outsider.tasks.create({ projectEntityId: project.entityId, title: "Intrusion" }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(
      fixture.db
        .insert(entityLinks)
        .values({
          organizationId: fixture.orgB,
          sourceEntityId: fixture.outsider,
          targetEntityId: task.entityId,
          createdByActorEntityId: fixture.outsider,
          relationType: "related_to",
        })
        .execute(),
    ).rejects.toMatchObject({ cause: { code: "23503" } });
    await expect(
      fixture.db
        .update(tasks)
        .set({ organizationId: fixture.orgB })
        .where(eq(tasks.entityId, task.entityId))
        .execute(),
    ).rejects.toMatchObject({ cause: { code: "23503" } });
  });

  test("creation rolls back with its caller and invalid references cannot be stored", async () => {
    const alice = fixture.forActor(fixture.alice);
    let rolledBackId = "";
    await expect(
      alice.transaction(async (repositories) => {
        const project = await repositories.projects.create({ name: "Rollback" });
        rolledBackId = project.entityId;
        await repositories.tasks.create({
          projectEntityId: project.entityId,
          title: "Rollback task",
        });
        throw new Error("abort");
      }),
    ).rejects.toThrow("abort");
    expect(
      await fixture.db.select().from(entities).where(eq(entities.entityId, rolledBackId)),
    ).toEqual([]);
    const project = await alice.projects.create({ name: "Real" });
    const task = await alice.tasks.create({ projectEntityId: project.entityId, title: "Real" });
    await expect(
      fixture.db
        .update(tasks)
        .set({ projectEntityId: crypto.randomUUID() })
        .where(eq(tasks.entityId, task.entityId))
        .execute(),
    ).rejects.toMatchObject({ cause: { code: "23503" } });
    await expect(
      fixture.db
        .update(tasks)
        .set({ parentTaskEntityId: task.entityId })
        .where(eq(tasks.entityId, task.entityId))
        .execute(),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
    await alice.entities.softDelete(project.entityId);
    await expect(alice.tasks.get(task.entityId)).rejects.toBeInstanceOf(AccessDeniedError);
  });

  test("task writes cannot replace identity or structure and comments share caller rollback", async () => {
    const alice = fixture.forActor(fixture.alice);
    const project = await alice.projects.create({ name: "One" });
    const other = await alice.projects.create({ name: "Two" });
    const task = await alice.tasks.create({ projectEntityId: project.entityId, title: "Original" });
    const update = {
      title: "Changed",
      projectEntityId: other.entityId,
      parentTaskEntityId: task.entityId,
      organizationId: fixture.orgB,
      entityId: fixture.outsider,
    };
    expect(await alice.tasks.update(task.entityId, update)).toMatchObject({
      entityId: task.entityId,
      organizationId: fixture.orgA,
      projectEntityId: project.entityId,
      parentTaskEntityId: null,
      title: "Changed",
    });
    await expect(
      fixture.db
        .update(entityAccessParents)
        .set({ parentEntityId: other.entityId })
        .where(eq(entityAccessParents.entityId, task.entityId))
        .execute(),
    ).rejects.toMatchObject({ cause: { code: "23503" } });
    await expect(
      alice.transaction(async (repositories) => {
        await repositories.tasks.addComment(task.entityId, "Must roll back");
        throw new Error("abort comment");
      }),
    ).rejects.toThrow("abort comment");
    expect(await alice.tasks.listComments(task.entityId, project.entityId)).toEqual([]);
    await expect(
      fixture.db
        .insert(taskComments)
        .values({
          organizationId: fixture.orgB,
          taskEntityId: task.entityId,
          authorActorEntityId: fixture.outsider,
          body: "Wrong org",
        })
        .execute(),
    ).rejects.toMatchObject({ cause: { code: "23503" } });
    await expect(
      alice.tasks.create({
        projectEntityId: project.entityId,
        title: "Invisible assignee",
        assigneeActorEntityId: fixture.bob,
      }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });
});

test("task create locks the project once and update batches activity with one assignment notification", async () => {
  const alice = fixture.forActor(fixture.alice);
  const project = await alice.projects.create({ name: "Counted" });
  await alice.permissions.grant({
    entityId: project.entityId,
    actorEntityId: fixture.bob,
    level: "view",
  });
  const statements: string[] = [];
  const db = drizzle(fixture.db.$client, {
    schema,
    logger: { logQuery: (query) => statements.push(query) },
  });
  const repos = createRepositories(db).forActor({
    organizationId: fixture.orgA,
    actorEntityId: fixture.alice,
  });
  const task = await repos.tasks.create({ projectEntityId: project.entityId, title: "Count" });
  expect(statements.filter((query) => query.includes("FOR UPDATE"))).toHaveLength(1);
  expect(statements).toHaveLength(7);
  statements.length = 0;
  await repos.tasks.update(task.entityId, {
    title: "Counted",
    status: "in_progress",
    priority: "high",
    assigneeActorEntityId: fixture.bob,
  });
  // The task's lock path covers its project, so the update locks once.
  expect(statements.filter((query) => query.includes("FOR UPDATE"))).toHaveLength(1);
  expect(statements).toHaveLength(10);
  const activity = await fixture.db
    .select()
    .from(schema.taskActivity)
    .where(eq(schema.taskActivity.taskEntityId, task.entityId));
  expect(activity.map((event) => event.action).sort()).toEqual(
    [
      "Assignee changed",
      "Priority changed",
      "Status changed",
      "Task created",
      "Title changed",
    ].sort(),
  );
  const assigned = activity.find((event) => event.action === "Assignee changed")!;
  expect(
    (await fixture.db.select().from(schema.notifications)).map((row) => ({
      recipient: row.recipientActorEntityId,
      kind: row.kind,
      eventKey: row.eventKey,
    })),
  ).toEqual([{ recipient: fixture.bob, kind: "assignment", eventKey: assigned.id }]);
});

test("task comments require their actual project and use three repository statements", async () => {
  const alice = fixture.forActor(fixture.alice);
  const project = await alice.projects.create({ name: "Comments" });
  const other = await alice.projects.create({ name: "Other accessible project" });
  const task = await alice.tasks.create({ projectEntityId: project.entityId, title: "Ship" });
  const comment = await alice.tasks.addComment(task.entityId, "Ready");
  const statements: string[] = [];
  const db = drizzle(fixture.db.$client, {
    schema,
    logger: { logQuery: (query) => statements.push(query) },
  });
  const repos = createRepositories(db).forActor({
    organizationId: fixture.orgA,
    actorEntityId: fixture.alice,
  });
  const previousTask = await repos.tasks.get(task.entityId);
  const previousComments = await repos.tasks.listComments(previousTask.entityId, project.entityId);
  expect(statements).toHaveLength(5);
  statements.length = 0;
  expect(await repos.tasks.listComments(task.entityId, project.entityId)).toEqual([
    {
      id: comment.id,
      body: "Ready",
      createdAt: comment.createdAt,
      authorName: "Alice",
      authorType: "human",
    },
  ]);
  expect(previousComments.map((row) => row.id)).toEqual([comment.id]);
  expect(statements).toHaveLength(3);
  await expect(alice.tasks.listComments(task.entityId, other.entityId)).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
  await expect(alice.tasks.listComments(other.entityId, other.entityId)).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
  await expect(
    fixture
      .forActor(fixture.outsider, fixture.orgB)
      .tasks.listComments(task.entityId, project.entityId),
  ).rejects.toBeInstanceOf(AccessDeniedError);
});

test("task comments follow the actual project's grants, deletion and membership checks", async () => {
  const alice = fixture.forActor(fixture.alice);
  const bob = fixture.forActor(fixture.bob);
  const project = await alice.projects.create({ name: "Private" });
  const other = await bob.projects.create({ name: "Accessible decoy" });
  const task = await alice.tasks.create({ projectEntityId: project.entityId, title: "Secret" });
  await alice.tasks.addComment(task.entityId, "Private comment");
  await expect(bob.tasks.listComments(task.entityId, project.entityId)).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
  await expect(bob.tasks.listComments(task.entityId, other.entityId)).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
  await alice.permissions.grant({
    entityId: project.entityId,
    actorEntityId: fixture.bob,
    level: "view",
  });
  expect(
    (await bob.tasks.listComments(task.entityId, project.entityId)).map((row) => row.body),
  ).toEqual(["Private comment"]);
  for (const entityId of [task.entityId, project.entityId]) {
    await fixture.db
      .update(entities)
      .set({ deletedAt: new Date() })
      .where(eq(entities.entityId, entityId));
    await expect(bob.tasks.listComments(task.entityId, project.entityId)).rejects.toBeInstanceOf(
      AccessDeniedError,
    );
    await fixture.db
      .update(entities)
      .set({ deletedAt: null })
      .where(eq(entities.entityId, entityId));
  }
  await fixture.db.delete(member).where(eq(member.id, "bob-a"));
  await expect(bob.tasks.listComments(task.entityId, project.entityId)).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
});

test("task writes deny non-project parents and mismatched projects without writing", async () => {
  const alice = fixture.forActor(fixture.alice);
  const project = await alice.projects.create({ name: "Actual" });
  const other = await alice.projects.create({ name: "Other" });
  const contact = await alice.contacts.create({ displayName: "Not a project" });
  const task = await alice.tasks.create({ projectEntityId: project.entityId, title: "Ship" });
  await expect(
    alice.tasks.create({ projectEntityId: contact.entityId, title: "Orphan" }),
  ).rejects.toBeInstanceOf(AccessDeniedError);
  await expect(
    alice.tasks.update(task.entityId, { title: "Moved" }, other.entityId),
  ).rejects.toBeInstanceOf(AccessDeniedError);
  await expect(alice.tasks.addComment(task.entityId, "Hi", other.entityId)).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
  expect(await fixture.db.select().from(tasks)).toEqual([task]);
  expect(await fixture.db.select().from(taskComments)).toEqual([]);
  expect(
    (await alice.tasks.update(task.entityId, { title: "Renamed" }, project.entityId)).title,
  ).toBe("Renamed");
});
