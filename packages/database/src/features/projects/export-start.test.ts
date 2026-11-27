import { ensureUserAgentActor } from "../../core/actors/provisioning";
import { userAgents } from "../../core/actors/user-agents.schema";
import { organizationApps } from "../../core/apps/schema";
import { entities } from "../../core/entities/schema";
import { member } from "../../core/organizations/schema";
import { AccessDeniedError, AppDisabledError } from "../../errors";
import { ActorRepositories, createRepositories } from "../../repositories";
import { setupDatabase } from "../../testing/database";
import { recordQueries } from "../../testing/queries";
import { rejection } from "../../testing/rejection";
import { expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";

const f = setupDatabase();

test("export startup reads one bounded page with the same export fields as exportPage", async () => {
  await f.verifyEmails();
  const alice = f.forActor(f.alice);
  const project = await alice.projects.create({ name: "Export", description: "Project details" });
  const [definition] = await f.db
    .insert(userAgents)
    .values({
      userId: "alice",
      name: "Helper",
      instructions: "Help",
      avatarCode: "100000",
      harness: "opencode",
    })
    .returning();
  const agent = await ensureUserAgentActor(f.db, {
    userId: "alice",
    userAgentId: definition!.id,
    organizationId: f.orgA,
  });
  const parent = await alice.tasks.create({
    projectEntityId: project.entityId,
    title: "Human",
    description: "Details",
    assigneeActorEntityId: f.alice,
    dueDate: "2026-12-01",
    status: "in_progress",
    priority: "high",
  });
  await alice.tasks.create({
    projectEntityId: project.entityId,
    title: "Agent",
    assigneeActorEntityId: agent.entityId,
    parentTaskEntityId: parent.entityId,
  });
  const unassigned = await alice.tasks.create({ projectEntityId: project.entityId, title: "None" });
  await f.db
    .update(entities)
    .set({
      updatedAt: sql`'2026-11-22T12:34:56.123456Z'::timestamptz`,
    })
    .where(eq(entities.entityId, parent.entityId));
  await f.db
    .update(entities)
    .set({
      updatedAt: sql`'1969-12-31T23:59:59.999999Z'::timestamptz`,
    })
    .where(eq(entities.entityId, unassigned.entityId));
  const deleted = await alice.tasks.create({ projectEntityId: project.entityId, title: "Deleted" });
  await alice.tasks.delete(deleted.entityId, project.entityId);
  const other = await alice.projects.create({ name: "Other" });
  await alice.tasks.create({ projectEntityId: other.entityId, title: "Not exported" });
  const { db, queries } = recordQueries();
  const repositories = await createRepositories(db).forSession({
    userId: "alice",
    organizationId: f.orgA,
  });
  queries.length = 0;
  await repositories.projects.get(project.entityId);
  const expected = await repositories.tasks.exportPage(project.entityId);
  expect(queries).toHaveLength(3);
  queries.length = 0;
  const result = await repositories.projects.exportStart(project.entityId);
  expect(queries).toHaveLength(1);
  expect(result.project).toEqual(project);
  expect(result.firstPage).toEqual(
    expected.map(({ task, assignee, updatedAt }) => ({
      task: {
        entityId: task.entityId,
        projectEntityId: task.projectEntityId,
        parentTaskEntityId: task.parentTaskEntityId,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        assigneeActorEntityId: task.assigneeActorEntityId,
        dueDate: task.dueDate,
      },
      assignee,
      updatedAt,
    })),
  );
  expect(result.firstPage).toHaveLength(3);
});

test("export startup distinguishes authorized empty projects from denied projects and rechecks roles", async () => {
  const alice = f.forActor(f.alice);
  const bob = f.forActor(f.bob);
  const project = await alice.projects.create({ name: "Empty" });
  const foreign = await f.forActor(f.outsider, f.orgB).projects.create({ name: "Foreign" });
  const task = await alice.tasks.create({ projectEntityId: project.entityId, title: "Wrong type" });
  await alice.tasks.delete(task.entityId, project.entityId);
  for (const id of [
    crypto.randomUUID(),
    project.entityId,
    task.entityId,
    f.alice,
    foreign.entityId,
  ])
    expect(await rejection(bob.projects.exportStart(id))).toBeInstanceOf(AccessDeniedError);
  await alice.projects.share(project.entityId, f.bob, "view");
  expect(await bob.projects.exportStart(project.entityId)).toEqual({ project, firstPage: [] });
  await alice.projects.revoke(project.entityId, f.bob);
  for (const role of ["admin", "owner"]) {
    await f.db.update(member).set({ role }).where(eq(member.id, "bob-a"));
    expect((await bob.projects.exportStart(project.entityId)).firstPage).toEqual([]);
  }
  await f.db.update(member).set({ role: "member" }).where(eq(member.id, "bob-a"));
  expect(await rejection(bob.projects.exportStart(project.entityId))).toBeInstanceOf(
    AccessDeniedError,
  );
  await f.db
    .update(organizationApps)
    .set({ enabled: false })
    .where(eq(organizationApps.organizationId, f.orgA));
  expect(await rejection(alice.projects.exportStart(project.entityId))).toBeInstanceOf(
    AppDisabledError,
  );
  await f.db
    .update(organizationApps)
    .set({ enabled: true })
    .where(eq(organizationApps.organizationId, f.orgA));
  await alice.projects.archive(project.entityId);
  await alice.projects.delete(project.entityId);
  expect(await rejection(alice.projects.exportStart(project.entityId))).toBeInstanceOf(
    AccessDeniedError,
  );
});

test("export startup stops at 100 and later pages keep the cursor and fresh access checks", async () => {
  const alice = f.forActor(f.alice);
  const project = await alice.projects.create({ name: "Paged" });
  for (let i = 0; i < 103; i++)
    await alice.tasks.create({ projectEntityId: project.entityId, title: `Task ${i}` });
  await alice.projects.share(project.entityId, f.bob, "view");
  const { db, queries } = recordQueries();
  const bob = new ActorRepositories(db, { organizationId: f.orgA, actorEntityId: f.bob });
  const { firstPage } = await bob.projects.exportStart(project.entityId);
  expect(queries).toHaveLength(1);
  expect(firstPage).toHaveLength(100);
  const next = await bob.tasks.exportPage(project.entityId, firstPage.at(-1)!.task.entityId);
  expect(next).toHaveLength(3);
  const ids = [...firstPage, ...next].map(({ task }) => task.entityId);
  expect(ids).toEqual((await alice.tasks.list(project.entityId)).map((task) => task.entityId));
  expect(new Set(ids).size).toBe(103);
  await alice.projects.revoke(project.entityId, f.bob);
  expect(
    await rejection(bob.tasks.exportPage(project.entityId, firstPage.at(-1)!.task.entityId)),
  ).toBeInstanceOf(AccessDeniedError);
});
