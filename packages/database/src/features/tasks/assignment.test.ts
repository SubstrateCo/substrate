import { ensureUserAgentActor } from "../../core/actors/provisioning";
import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import { entities } from "../../core/entities/schema";
import { member } from "../../core/organizations/schema";
import { entityGrants } from "../../core/permissions/schema";
import { RepositoryContext } from "../../core/repository-context";
import { AccessDeniedError } from "../../errors";
import { setupDatabase } from "../../testing/database";
import { recordQueries } from "../../testing/queries";
import { rejection } from "../../testing/rejection";
import { requireAssignee } from "./assignment";
import { expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";

const f = setupDatabase();

test("assignee validation checks the candidate's project access in one statement", async () => {
  const alice = f.forActor(f.alice);
  const project = await alice.projects.create({ name: "Private" });
  await alice.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  const { db, queries } = recordQueries();
  const ctx = new RepositoryContext(db, { organizationId: f.orgA, actorEntityId: f.alice });
  await requireAssignee(ctx, project.entityId, f.bob);
  expect(queries).toHaveLength(1);
  await alice.permissions.revoke({ entityId: project.entityId, actorEntityId: f.bob });
  expect(await rejection(requireAssignee(ctx, project.entityId, f.bob, f.bob))).toBeInstanceOf(
    AccessDeniedError,
  );
});

test("hidden agents may be retained, but not newly assigned, and still need owner access", async () => {
  const alice = f.forActor(f.alice);
  const project = await alice.projects.create({ name: "Shared" });
  await alice.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "edit",
  });
  const [definition] = await f.db
    .insert(userAgents)
    .values({
      userId: "bob",
      name: "Helper",
      instructions: "Help",
      avatarCode: "100000",
      harness: "opencode",
    })
    .returning();
  const agent = await ensureUserAgentActor(f.db, {
    userId: "bob",
    userAgentId: definition!.id,
    organizationId: f.orgA,
  });
  const task = await alice.tasks.create({ projectEntityId: project.entityId, title: "Original" });
  expect(
    await rejection(alice.tasks.update(task.entityId, { assigneeActorEntityId: agent.entityId })),
  ).toBeInstanceOf(AccessDeniedError);
  await f.forActor(f.bob).tasks.update(task.entityId, { assigneeActorEntityId: agent.entityId });
  expect(
    await alice.tasks.update(task.entityId, {
      assigneeActorEntityId: agent.entityId,
      title: "Retained",
    }),
  ).toMatchObject({ assigneeActorEntityId: agent.entityId, title: "Retained" });
  await f.db
    .delete(entityGrants)
    .where(and(eq(entityGrants.entityId, project.entityId), eq(entityGrants.actorEntityId, f.bob)));
  expect(
    await rejection(
      alice.tasks.update(task.entityId, {
        assigneeActorEntityId: agent.entityId,
        title: "Denied",
      }),
    ),
  ).toBeInstanceOf(AccessDeniedError);
  expect(await alice.tasks.get(task.entityId)).toMatchObject({
    assigneeActorEntityId: agent.entityId,
    title: "Retained",
  });
});

for (const state of ["disabled", "deleted", "departed", "foreign"] as const) {
  test(`${state} assignees are denied even when retained`, async () => {
    const alice = f.forActor(f.alice);
    const project = await alice.projects.create({ name: "Private" });
    await alice.permissions.grant({
      entityId: project.entityId,
      actorEntityId: f.bob,
      level: "view",
    });
    if (state === "disabled")
      await f.db.update(actors).set({ disabledAt: new Date() }).where(eq(actors.entityId, f.bob));
    if (state === "deleted")
      await f.db
        .update(entities)
        .set({ deletedAt: new Date() })
        .where(eq(entities.entityId, f.bob));
    if (state === "departed") await f.db.delete(member).where(eq(member.id, "bob-a"));
    const candidate = state === "foreign" ? f.outsider : f.bob;
    const ctx = new RepositoryContext(f.db, {
      organizationId: f.orgA,
      actorEntityId: f.alice,
    });
    for (const current of [null, candidate])
      expect(
        await rejection(requireAssignee(ctx, project.entityId, candidate, current)),
      ).toBeInstanceOf(AccessDeniedError);
  });
}

test("assignee access follows the candidate's current admin role", async () => {
  const alice = f.forActor(f.alice);
  const project = await alice.projects.create({ name: "Private" });
  await f.db.update(member).set({ role: "admin" }).where(eq(member.id, "bob-a"));
  const task = await alice.tasks.create({
    projectEntityId: project.entityId,
    title: "Admin",
    assigneeActorEntityId: f.bob,
  });
  expect(task.assigneeActorEntityId).toBe(f.bob);
  await f.db.update(member).set({ role: "member" }).where(eq(member.id, "bob-a"));
  expect(
    await rejection(alice.tasks.update(task.entityId, { assigneeActorEntityId: f.bob })),
  ).toBeInstanceOf(AccessDeniedError);
});
