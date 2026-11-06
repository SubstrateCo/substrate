/* oxlint-disable typescript/await-thenable -- Bun's rejects matchers return promises at runtime. */
import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { AccessDeniedError, ValidationError } from "../../errors";
import { setupDatabase } from "../../testing/database";
import { entities } from "../../core/entities/schema";
import { entityLinks } from "../../core/links/schema";
import { entityAccessParents } from "../../core/permissions/access-parents";
import { taskComments } from "./comments.schema";
import { tasks } from "./tasks.schema";

const fixture = setupDatabase();

describe("projects and tasks", () => {
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
    await expect(bob.tasks.listComments(child.entityId)).rejects.toBeInstanceOf(AccessDeniedError);
  });

  test("defaults and custom statuses belong to one project, as do subtasks and assignees", async () => {
    const alice = fixture.forActor(fixture.alice);
    const first = await alice.projects.create({ name: "One" });
    const second = await alice.projects.create({ name: "Two" });
    expect(
      (await alice.projects.listStatuses(first.entityId)).map((status) => status.name),
    ).toEqual(["Todo", "In progress", "Done", "Canceled"]);
    const custom = await alice.projects.addStatus(first.entityId, {
      name: "In review",
      category: "active",
    });
    const task = await alice.tasks.create({
      projectEntityId: first.entityId,
      title: "Review",
      statusId: custom.id,
      assigneeActorEntityId: fixture.alice,
      priority: "high",
      dueDate: "2026-12-01",
    });
    expect(task).toMatchObject({
      statusId: custom.id,
      assigneeActorEntityId: fixture.alice,
      priority: "high",
      dueDate: "2026-12-01",
    });
    await expect(
      alice.tasks.create({
        projectEntityId: second.entityId,
        title: "Bad status",
        statusId: custom.id,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
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
    expect(await alice.tasks.listComments(task.entityId)).toEqual([]);
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
