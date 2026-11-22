import { realtimeKeys } from "@substrate/contracts/realtime";

import { ensureHumanActor, ensureUserAgentActor } from "../../core/actors/provisioning";
import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import { user } from "../../core/authentication/schema";
import { entities } from "../../core/entities/schema";
import { member } from "../../core/organizations/schema";
import { entityGrants } from "../../core/permissions/schema";
import { RepositoryContext, type PermissionLevel } from "../../core/repository-context";
import { AccessDeniedError, ValidationError } from "../../errors";
import { ActorRepositories } from "../../repositories";
import { setupDatabase } from "../../testing/database";
import { recordQueries } from "../../testing/queries";
import { rejection } from "../../testing/rejection";
import * as assignment from "../tasks/assignment";
import { queryProjects } from "./queries";
import { projects } from "./schema";
import { expect, spyOn, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";

const f = setupDatabase();

test("projects whitelist fields and reject blank names without orphan entities", async () => {
  const alice = f.forActor(f.alice);
  const input = {
    name: "  Launch  ",
    organizationId: f.orgB,
    entityId: f.outsider,
    entityType: "task",
  };
  const project = await alice.projects.create(input);
  expect(project).toMatchObject({ organizationId: f.orgA, entityType: "project", name: "Launch" });
  expect(project.entityId).not.toBe(f.outsider);
  const before = await f.db.select().from(entities);
  expect(await rejection(alice.projects.create({ name: " " }))).toBeInstanceOf(ValidationError);
  expect(await f.db.select().from(entities)).toHaveLength(before.length);
  const update = {
    name: "Renamed",
    description: "New scope",
    organizationId: f.orgB,
    entityId: f.outsider,
  };
  expect(await alice.projects.update(project.entityId, update)).toMatchObject({
    entityId: project.entityId,
    organizationId: f.orgA,
    name: "Renamed",
    description: "New scope",
  });
});

test("project editors can update projects but viewers and organization admins have no implicit edit access", async () => {
  const alice = f.forActor(f.alice);
  const bob = f.forActor(f.bob);
  const project = await alice.projects.create({ name: "Private" });
  expect(await rejection(bob.projects.get(project.entityId))).toBeInstanceOf(AccessDeniedError);
  await alice.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  expect(
    await rejection(
      bob.projects.update(project.entityId, { name: "Not allowed", description: "" }),
    ),
  ).toBeInstanceOf(AccessDeniedError);
  await alice.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "edit",
  });
  expect(
    await bob.projects.update(project.entityId, { name: "Renamed", description: "Review" }),
  ).toMatchObject({ name: "Renamed", description: "Review" });
  expect(
    (await bob.projects.getDetail(project.entityId)).actors.map((actor) => actor.entityId).sort(),
  ).toEqual([f.alice, f.bob].sort());
});

test("project references enforce entity type and organization alignment", async () => {
  expect(
    await rejection(
      f.db
        .insert(projects)
        .values({ entityId: f.alice, organizationId: f.orgA, name: "Wrong type" })
        .execute(),
    ),
  ).toMatchObject({ cause: { code: "23503" } });
  const project = await f.forActor(f.alice).projects.create({ name: "Private" });
  expect(
    await rejection(
      f.db
        .update(projects)
        .set({ organizationId: f.orgB })
        .where(eq(projects.entityId, project.entityId))
        .execute(),
    ),
  ).toMatchObject({ cause: { code: "23503" } });
  await f
    .forActor(f.alice)
    .permissions.revoke({ entityId: project.entityId, actorEntityId: f.bob });
  expect(await f.forActor(f.outsider, f.orgB).projects.list()).toEqual([]);
  expect(
    await f.db.select().from(projects).where(eq(projects.entityId, project.entityId)),
  ).toHaveLength(1);
});

const locks = (queries: string[]) =>
  queries.filter((query) => query.includes("FOR NO KEY UPDATE")).length;

test("project sharing checks the project under one structural lock and keeps grant rules", async () => {
  const alice = f.forActor(f.alice);
  const project = await alice.projects.create({ name: "Shared" });
  const task = await alice.tasks.create({ projectEntityId: project.entityId, title: "Child" });
  const account = await alice.crm.createAccount({ name: "Not a project" });
  const { db, queries } = recordQueries();
  const repos = new ActorRepositories(db, { organizationId: f.orgA, actorEntityId: f.alice });
  const shared = await repos.transaction((tx) =>
    tx.projects.share(project.entityId, f.bob, "edit"),
  );
  // Lock path (2), target actor, existing grant, upsert.
  expect(queries).toHaveLength(5);
  expect(locks(queries)).toBe(1);
  expect(shared.hints).toEqual(
    expect.arrayContaining([
      { audience: realtimeKeys.actor(f.orgA, f.bob), domain: "access" },
      { audience: realtimeKeys.organization(f.orgA), domain: "tasks" },
    ]),
  );
  expect(await f.accessLevel(f.bob, project.entityId)).toBe("edit");

  for (const id of [task.entityId, account.entityId])
    expect(await rejection(alice.projects.share(id, f.bob, "view"))).toBeInstanceOf(
      AccessDeniedError,
    );
  expect(
    await f.db
      .select()
      .from(entityGrants)
      .where(inArray(entityGrants.entityId, [task.entityId, account.entityId])),
  ).toEqual([
    expect.objectContaining({ entityId: account.entityId, actorEntityId: f.alice, level: "owner" }),
  ]);
  // SAFETY: Deliberately invalid input from an untyped caller.
  const unknown = "admin" as PermissionLevel;
  expect(() => alice.projects.share(project.entityId, f.bob, unknown)).toThrow(
    "Unknown permission level",
  );
  const [definition] = await f.db
    .insert(userAgents)
    .values({ userId: "bob", name: "Helper", instructions: "Help", harness: "opencode" })
    .returning();
  const agent = await ensureUserAgentActor(f.db, {
    userId: "bob",
    userAgentId: definition!.id,
    organizationId: f.orgA,
  });
  expect(
    await rejection(alice.projects.share(project.entityId, agent.entityId, "view")),
  ).toBeInstanceOf(ValidationError);
  expect(
    await rejection(alice.projects.share(project.entityId, f.outsider, "view")),
  ).toBeInstanceOf(AccessDeniedError);
  expect(
    await rejection(f.forActor(f.bob).projects.share(project.entityId, f.bob, "owner")),
  ).toBeInstanceOf(AccessDeniedError);
  expect(await rejection(alice.projects.share(project.entityId, f.alice, "view"))).toMatchObject({
    message: expect.stringContaining("last owner"),
  });
  const abort = new Error("Abort sharing");
  expect(
    await rejection(
      alice.transaction(async (tx) => {
        await tx.projects.share(project.entityId, f.bob, "owner");
        throw abort;
      }),
    ),
  ).toBe(abort);
  expect(await f.accessLevel(f.bob, project.entityId)).toBe("edit");
});

test("project revocation keeps assignments, locks once, and protects the last owner", async () => {
  const alice = f.forActor(f.alice);
  const project = await alice.projects.create({ name: "Shared" });
  const task = await alice.tasks.create({ projectEntityId: project.entityId, title: "Assigned" });
  await alice.projects.share(project.entityId, f.bob, "view");
  await alice.tasks.update(task.entityId, { assigneeActorEntityId: f.bob });
  expect(await rejection(alice.projects.revoke(project.entityId, f.bob))).toBeInstanceOf(
    ValidationError,
  );
  expect((await alice.tasks.get(task.entityId)).assigneeActorEntityId).toBe(f.bob);
  expect(await f.accessLevel(f.bob, project.entityId)).toBe("view");
  expect(
    await rejection(f.forActor(f.bob).projects.revoke(project.entityId, f.alice)),
  ).toBeInstanceOf(AccessDeniedError);
  expect(await rejection(alice.projects.revoke(task.entityId, f.bob))).toBeInstanceOf(
    AccessDeniedError,
  );
  await alice.tasks.update(task.entityId, { assigneeActorEntityId: null });

  const { db, queries } = recordQueries();
  const repos = new ActorRepositories(db, { organizationId: f.orgA, actorEntityId: f.alice });
  const revoked = await repos.transaction((tx) => tx.projects.revoke(project.entityId, f.bob));
  // Lock path (2), assignments, fresh owner check, existing grant, delete.
  expect(queries).toHaveLength(6);
  expect(locks(queries)).toBe(1);
  expect(revoked.hints).toContainEqual({
    audience: realtimeKeys.actor(f.orgA, f.bob),
    domain: "access",
  });
  expect(await rejection(f.forActor(f.bob).projects.get(project.entityId))).toBeInstanceOf(
    AccessDeniedError,
  );
  queries.length = 0;
  const missing = await repos.transaction((tx) => tx.projects.revoke(project.entityId, f.bob));
  expect(queries.filter((query) => /^(insert|update|delete)\b/i.test(query))).toEqual([]);
  expect(missing.hints).toEqual([]);
  expect(await rejection(alice.projects.revoke(project.entityId, f.alice))).toMatchObject({
    message: expect.stringContaining("last owner"),
  });
});

test("project revocation denies an admin demoted after the assignment check", async () => {
  await f.db.insert(user).values({ id: "carol", name: "Carol", email: "carol@example.com" });
  await f.db
    .insert(member)
    .values({ id: "carol-a", userId: "carol", organizationId: f.orgA, role: "member" });
  const carol = await ensureHumanActor(f.db, { organizationId: f.orgA, userId: "carol" });
  const bob = f.forActor(f.bob);
  const project = await bob.projects.create({ name: "Bob's" });
  await bob.projects.share(project.entityId, carol.entityId, "edit");
  const grants = () =>
    f.db.select().from(entityGrants).where(eq(entityGrants.entityId, project.entityId));
  const before = await grants();
  // Alice reaches the project only through her organization owner role.
  expect(before.map((grant) => grant.actorEntityId)).not.toContain(f.alice);
  const original = assignment.requireUnassignedProjectActor;
  const guard = spyOn(assignment, "requireUnassignedProjectActor").mockImplementation(
    async (...args) => {
      await original(...args);
      await f.db.update(member).set({ role: "member" }).where(eq(member.id, "alice-a"));
    },
  );
  try {
    expect(
      await rejection(f.forActor(f.alice).projects.revoke(project.entityId, carol.entityId)),
    ).toBeInstanceOf(AccessDeniedError);
    expect(guard).toHaveBeenCalledTimes(1);
  } finally {
    guard.mockRestore();
  }
  expect(await grants()).toEqual(before);
  expect(await f.db.select().from(member).where(eq(member.id, "alice-a"))).toEqual([
    expect.objectContaining({ role: "member" }),
  ]);
});

test("concurrent project owners cannot remove each other and leave no owner", async () => {
  const alice = f.forActor(f.alice);
  const project = await alice.projects.create({ name: "Owned" });
  await alice.projects.share(project.entityId, f.bob, "owner");
  const results = await Promise.allSettled([
    alice.projects.revoke(project.entityId, f.bob),
    f.forActor(f.bob).projects.revoke(project.entityId, f.alice),
  ]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(
    await f.db.select().from(entityGrants).where(eq(entityGrants.entityId, project.entityId)),
  ).toEqual([expect.objectContaining({ level: "owner" })]);
});

test("project lists page readable projects by name and deny inactive actors", async () => {
  const bob = f.forActor(f.bob);
  const beta = await bob.projects.create({ name: "Beta" });
  const alpha = await bob.projects.create({ name: "Alpha" });
  await f.forActor(f.alice).projects.create({ name: "Alice only" });
  const context = new RepositoryContext(f.db, { organizationId: f.orgA, actorEntityId: f.bob });
  expect(await bob.projects.list()).toEqual([alpha, beta]);
  expect(await queryProjects(context, { offset: 1, limit: 1 })).toEqual([beta]);
  expect(await queryProjects(context, { offset: 2, limit: 1 })).toEqual([]);
  await f.db.update(actors).set({ disabledAt: new Date() }).where(eq(actors.entityId, f.bob));
  for (const page of [{}, { offset: 2, limit: 1 }])
    expect(await rejection(queryProjects(context, page))).toBeInstanceOf(AccessDeniedError);
});
