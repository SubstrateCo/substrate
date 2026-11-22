import { ensureUserAgentActor } from "../../core/actors/provisioning";
import { workspaceContext } from "../../core/session/workspace";
import { AccessDeniedError } from "../../errors";
import { actors, entities, entityGrants, member, user, userAgents } from "../../schema";
import { setupDatabase } from "../../testing/database";
import { recordQueries } from "../../testing/queries";
import { rejection } from "../../testing/rejection";
import { requireContextTarget, requireWork } from "./access";
import { expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";

const f = setupDatabase();

test("an existing human actor is verified in one statement", async () => {
  await f.db.update(user).set({ emailVerified: true });
  const { db, queries } = recordQueries();
  const { context, actor, userName } = await workspaceContext(db, {
    userId: "alice",
    organizationId: f.orgA,
  });
  expect(context.scope).toEqual({
    userId: "alice",
    organizationId: f.orgA,
    actorEntityId: f.alice,
    admin: true,
  });
  expect(actor).toEqual({ entityId: f.alice, name: "Alice", type: "human" });
  expect(userName).toBe("Alice");
  expect(queries).toHaveLength(1);
});

test("first human use provisions the actor once and later uses take the fast path", async () => {
  await f.db.update(user).set({ emailVerified: true });
  await f.db.insert(member).values({ id: "bob-b", userId: "bob", organizationId: f.orgB });
  const { db, queries } = recordQueries();
  const scope = { userId: "bob", organizationId: f.orgB };
  const first = await workspaceContext(db, scope);
  expect(first.actor).toMatchObject({ name: "Bob", type: "human" });
  expect(first.actor.entityId).not.toBe(f.bob);
  queries.length = 0;
  const second = await workspaceContext(db, scope);
  expect(second.actor).toEqual(first.actor);
  expect(queries).toHaveLength(1);
  expect(
    await f.db
      .select()
      .from(actors)
      .where(and(eq(actors.userId, "bob"), eq(actors.organizationId, f.orgB))),
  ).toHaveLength(1);
});

for (const invalid of ["unverified", "removed", "disabled", "deleted", "foreign"] as const) {
  test(`human workspace context denies a ${invalid} identity without provisioning`, async () => {
    await f.db.update(user).set({ emailVerified: invalid !== "unverified" });
    if (invalid === "removed") await f.db.delete(member).where(eq(member.id, "alice-a"));
    if (invalid === "disabled")
      await f.db.update(actors).set({ disabledAt: new Date() }).where(eq(actors.entityId, f.alice));
    if (invalid === "deleted")
      await f.db
        .update(entities)
        .set({ deletedAt: new Date() })
        .where(eq(entities.entityId, f.alice));
    const before = await f.db.select().from(actors);
    expect(
      await rejection(
        workspaceContext(f.db, {
          userId: "alice",
          organizationId: invalid === "foreign" ? f.orgB : f.orgA,
        }),
      ),
    ).toBeInstanceOf(AccessDeniedError);
    expect(await f.db.select().from(actors)).toEqual(before);
  });
}

test("an agent actor is verified in one statement", async () => {
  await f.db.update(user).set({ emailVerified: true });
  const [agent] = await f.db
    .insert(userAgents)
    .values({ userId: "alice", name: "Research", instructions: "", harness: "opencode" })
    .returning();
  const actor = await ensureUserAgentActor(f.db, {
    organizationId: f.orgA,
    userId: "alice",
    userAgentId: agent!.id,
  });
  const scope = { userId: "alice", organizationId: f.orgA, actorEntityId: actor.entityId };
  const { db, queries } = recordQueries();
  expect((await workspaceContext(db, scope)).actor).toEqual({
    entityId: actor.entityId,
    name: "Research",
    type: "agent",
  });
  expect(queries).toHaveLength(1);
  expect(await rejection(workspaceContext(f.db, { ...scope, userId: "bob" }))).toBeInstanceOf(
    AccessDeniedError,
  );
  expect(
    await rejection(workspaceContext(f.db, { ...scope, actorEntityId: f.alice })),
  ).toBeInstanceOf(AccessDeniedError);
  await f.db.update(userAgents).set({ enabled: false }).where(eq(userAgents.id, agent!.id));
  expect(await rejection(workspaceContext(f.db, scope))).toBeInstanceOf(AccessDeniedError);
});

test("task work uses two statements and reports the project's access", async () => {
  await f.db.update(user).set({ emailVerified: true });
  const alice = f.forActor(f.alice);
  const project = await alice.projects.create({ name: "Launch" });
  const task = await alice.tasks.create({ projectEntityId: project.entityId, title: "Ship" });
  await alice.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  const { db, queries } = recordQueries();
  const { context } = await workspaceContext(db, { userId: "bob", organizationId: f.orgA });
  queries.length = 0;
  expect(await requireWork(context, task.entityId)).toMatchObject({
    entityType: "task",
    title: "Ship",
    projectEntityId: project.entityId,
    statusName: "Not started",
    level: "view",
  });
  expect(queries).toHaveLength(2);
  queries.length = 0;
  expect(await requireWork(context, project.entityId)).toMatchObject({
    entityType: "project",
    title: "Launch",
    level: "view",
  });
  expect(queries).toHaveLength(2);
  expect(await rejection(requireWork(context, task.entityId, "edit"))).toBeInstanceOf(
    AccessDeniedError,
  );
  await f.db
    .delete(entityGrants)
    .where(and(eq(entityGrants.entityId, project.entityId), eq(entityGrants.actorEntityId, f.bob)));
  expect(await rejection(requireWork(context, task.entityId))).toBeInstanceOf(AccessDeniedError);
  const contact = await alice.contacts.create({ displayName: "Customer" });
  const { context: owner } = await workspaceContext(f.db, {
    userId: "alice",
    organizationId: f.orgA,
  });
  expect(await rejection(requireWork(owner, contact.entityId))).toBeInstanceOf(AccessDeniedError);
});

test("work context targets check access once and keep the work fields", async () => {
  await f.db.update(user).set({ emailVerified: true });
  const alice = f.forActor(f.alice);
  const project = await alice.projects.create({ name: "Launch" });
  const task = await alice.tasks.create({ projectEntityId: project.entityId, title: "Ship" });
  await alice.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  const { db, queries } = recordQueries();
  const { context } = await workspaceContext(db, { userId: "bob", organizationId: f.orgA });
  for (const [entityId, expected] of [
    [task.entityId, { entityType: "task", title: "Ship", statusName: "Not started" }],
    [project.entityId, { entityType: "project", title: "Launch", statusName: null }],
  ] as const) {
    queries.length = 0;
    expect(await requireContextTarget(context, entityId)).toMatchObject({
      ...expected,
      projectEntityId: project.entityId,
      accessEntityId: project.entityId,
      level: "view",
    });
    expect(queries).toHaveLength(2);
  }
  expect(await rejection(requireContextTarget(context, task.entityId, "edit"))).toBeInstanceOf(
    AccessDeniedError,
  );
});
