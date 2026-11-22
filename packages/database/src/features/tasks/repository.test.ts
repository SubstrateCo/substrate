import { entities } from "../../core/entities/schema";
import { relatedPair } from "../../core/links/repository";
import { entityLinks } from "../../core/links/schema";
import { AccessDeniedError, ValidationError } from "../../errors";
import { ActorRepositories } from "../../repositories";
import * as schema from "../../schema";
import { discardEffects } from "../../testing/connection";
import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { messagingConversations } from "../messaging/schema";
import { tasks } from "./tasks.schema";
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
    expect(
      await rejection(alice.tasks.update(task.entityId, { status: "blocked" as never })),
    ).toBeInstanceOf(ValidationError);
    expect((await alice.tasks.get(task.entityId)).status).toBe("canceled");
    // SAFETY: Deliberately bypass the column type to verify PostgreSQL rejects an invalid status.
    expect(
      await rejection(
        fixture.db
          .update(tasks)
          .set({ status: "blocked" as never })
          .where(eq(tasks.entityId, task.entityId))
          .execute(),
      ),
    ).toMatchObject({ cause: { code: "23514" } });
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
    expect(await rejection(bob.tasks.get(task.entityId))).toBeInstanceOf(AccessDeniedError);
    await alice.permissions.grant({
      entityId: project.entityId,
      actorEntityId: fixture.bob,
      level: "view",
    });
    expect((await bob.tasks.list(project.entityId)).map((row) => row.entityId).sort()).toEqual(
      [task.entityId, child.entityId].sort(),
    );
    expect(await rejection(bob.tasks.update(task.entityId, { title: "Changed" }))).toBeInstanceOf(
      AccessDeniedError,
    );
    await alice.permissions.grant({
      entityId: project.entityId,
      actorEntityId: fixture.bob,
      level: "comment",
    });
    expect(await bob.tasks.ensureDiscussion(child.entityId)).toEqual(expect.any(String));
    await alice.permissions.grant({
      entityId: project.entityId,
      actorEntityId: fixture.bob,
      level: "edit",
    });
    expect((await bob.tasks.update(task.entityId, { title: "Changed" })).title).toBe("Changed");
    await alice.permissions.revoke({ entityId: project.entityId, actorEntityId: fixture.bob });
    expect(await rejection(bob.tasks.get(child.entityId))).toBeInstanceOf(AccessDeniedError);
    expect(
      await rejection(bob.tasks.ensureDiscussion(child.entityId, project.entityId)),
    ).toBeInstanceOf(AccessDeniedError);
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
    expect(
      await rejection(
        alice.tasks.create({
          projectEntityId: second.entityId,
          parentTaskEntityId: task.entityId,
          title: "Bad parent",
        }),
      ),
    ).toBeInstanceOf(ValidationError);
    expect(
      await rejection(
        alice.tasks.update(task.entityId, { assigneeActorEntityId: fixture.outsider }),
      ),
    ).toBeInstanceOf(AccessDeniedError);
    expect(
      await rejection(alice.tasks.update(task.entityId, { dueDate: "2026-02-31" })),
    ).toBeInstanceOf(ValidationError);
    expect(await rejection(alice.tasks.update(task.entityId, { title: " " }))).toBeInstanceOf(
      ValidationError,
    );
  });

  test("organization isolation and safe links apply to project tasks", async () => {
    const alice = fixture.forActor(fixture.alice);
    const outsider = fixture.forActor(fixture.outsider, fixture.orgB);
    const project = await alice.projects.create({ name: "Private" });
    const task = await alice.tasks.create({ projectEntityId: project.entityId, title: "Secret" });
    expect(await outsider.projects.list()).toEqual([]);
    expect(await rejection(outsider.tasks.get(task.entityId))).toBeInstanceOf(AccessDeniedError);
    expect(
      await rejection(
        outsider.tasks.create({ projectEntityId: project.entityId, title: "Intrusion" }),
      ),
    ).toBeInstanceOf(AccessDeniedError);
    expect(
      await rejection(
        fixture.db
          .insert(entityLinks)
          .values({
            organizationId: fixture.orgB,
            ...relatedPair(fixture.outsider, task.entityId),
            createdByActorEntityId: fixture.outsider,
            relationType: "related_to",
          })
          .execute(),
      ),
    ).toMatchObject({ cause: { code: "23503" } });
    expect(
      await rejection(
        fixture.db
          .update(tasks)
          .set({ organizationId: fixture.orgB })
          .where(eq(tasks.entityId, task.entityId))
          .execute(),
      ),
    ).toMatchObject({ cause: { code: "23503" } });
  });

  test("creation rolls back with its caller and invalid references cannot be stored", async () => {
    const alice = fixture.forActor(fixture.alice);
    let rolledBackId = "";
    expect(
      await rejection(
        alice.transaction(async (repositories) => {
          const project = await repositories.projects.create({ name: "Rollback" });
          rolledBackId = project.entityId;
          await repositories.tasks.create({
            projectEntityId: project.entityId,
            title: "Rollback task",
          });
          throw new Error("abort");
        }),
      ),
    ).toMatchObject({ message: expect.stringContaining("abort") });
    expect(
      await fixture.db.select().from(entities).where(eq(entities.entityId, rolledBackId)),
    ).toEqual([]);
    const project = await alice.projects.create({ name: "Real" });
    const task = await alice.tasks.create({ projectEntityId: project.entityId, title: "Real" });
    expect(
      await rejection(
        fixture.db
          .update(tasks)
          .set({ projectEntityId: crypto.randomUUID() })
          .where(eq(tasks.entityId, task.entityId))
          .execute(),
      ),
    ).toMatchObject({ cause: { code: "23503" } });
    expect(
      await rejection(
        fixture.db
          .update(tasks)
          .set({ parentTaskEntityId: task.entityId })
          .where(eq(tasks.entityId, task.entityId))
          .execute(),
      ),
    ).toMatchObject({ cause: { code: "23514" } });
    await alice.entities.softDelete(project.entityId);
    expect(await rejection(alice.tasks.get(task.entityId))).toBeInstanceOf(AccessDeniedError);
  });

  test("task writes cannot replace identity or structure and discussions share caller rollback", async () => {
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
    expect(
      await rejection(
        fixture.db
          .update(entities)
          .set({ accessEntityId: other.entityId })
          .where(eq(entities.entityId, task.entityId))
          .execute(),
      ),
    ).toMatchObject({ cause: { code: "23503" } });
    expect(
      await rejection(
        alice.transaction(async (repositories) => {
          await repositories.tasks.ensureDiscussion(task.entityId);
          throw new Error("abort discussion");
        }),
      ),
    ).toMatchObject({ message: expect.stringContaining("abort discussion") });
    expect(await fixture.db.select().from(messagingConversations)).toEqual([]);
    expect(
      await rejection(
        fixture.db
          .insert(messagingConversations)
          .values({
            organizationId: fixture.orgB,
            taskEntityId: task.entityId,
            kind: "group",
            createdBy: "outsider",
          })
          .execute(),
      ),
    ).toMatchObject({ cause: { code: "23503" } });
    expect(
      await rejection(
        alice.tasks.create({
          projectEntityId: project.entityId,
          title: "Invisible assignee",
          assigneeActorEntityId: fixture.bob,
        }),
      ),
    ).toBeInstanceOf(AccessDeniedError);
  });
});

test("task create locks the project once and update batches activity with one assignment notification", async () => {
  await fixture.verifyEmails();
  const alice = fixture.forActor(fixture.alice);
  const project = await alice.projects.create({ name: "Counted" });
  await alice.permissions.grant({
    entityId: project.entityId,
    actorEntityId: fixture.bob,
    level: "view",
  });
  const statements: string[] = [];
  const db = discardEffects(
    drizzle(fixture.db.$client, {
      logger: { logQuery: (query) => statements.push(query) },
    }),
  );
  const repos = new ActorRepositories(db, {
    organizationId: fixture.orgA,
    actorEntityId: fixture.alice,
  });
  const task = await repos.tasks.create({ projectEntityId: project.entityId, title: "Count" });
  expect(statements.filter((query) => query.includes("FOR NO KEY UPDATE"))).toHaveLength(1);
  expect(statements).toHaveLength(5);
  statements.length = 0;
  await repos.tasks.update(task.entityId, {
    title: "Counted",
    status: "in_progress",
    priority: "high",
    assigneeActorEntityId: fixture.bob,
  });
  // The task's lock path covers its project, so the update locks once.
  expect(statements.filter((query) => query.includes("FOR NO KEY UPDATE"))).toHaveLength(1);
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

test("task writes deny non-project parents and mismatched projects without writing", async () => {
  const alice = fixture.forActor(fixture.alice);
  const project = await alice.projects.create({ name: "Actual" });
  const other = await alice.projects.create({ name: "Other" });
  const contact = await alice.contacts.create({ displayName: "Not a project" });
  const task = await alice.tasks.create({ projectEntityId: project.entityId, title: "Ship" });
  expect(
    await rejection(alice.tasks.create({ projectEntityId: contact.entityId, title: "Orphan" })),
  ).toBeInstanceOf(AccessDeniedError);
  expect(
    await rejection(alice.tasks.update(task.entityId, { title: "Moved" }, other.entityId)),
  ).toBeInstanceOf(AccessDeniedError);
  expect(
    await rejection(alice.tasks.ensureDiscussion(task.entityId, other.entityId)),
  ).toBeInstanceOf(AccessDeniedError);
  expect(await fixture.db.select().from(tasks)).toEqual([task]);
  expect(await fixture.db.select().from(messagingConversations)).toEqual([]);
  expect(
    (await alice.tasks.update(task.entityId, { title: "Renamed" }, project.entityId)).title,
  ).toBe("Renamed");
});
