import { AccessDeniedError } from "../../errors";
import { createRepositories } from "../../repositories";
import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { ensureUserAgentActor } from "../actors/provisioning";
import { actors } from "../actors/schema";
import { userAgents } from "../actors/user-agents.schema";
import { user } from "../authentication/schema";
import { member } from "../organizations/schema";
import { RepositoryContext } from "../repository-context";
import { workspaceContext } from "./workspace";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";

const f = setupDatabase();

test("workspace lookups keep identities separate and read current roles", async () => {
  await f.verifyEmails();
  const scopes = await Promise.all([
    workspaceContext(f.db, { userId: "alice", organizationId: f.orgA }),
    workspaceContext(f.db, { userId: "bob", organizationId: f.orgA }),
    workspaceContext(f.db, { userId: "outsider", organizationId: f.orgB }),
  ]);
  expect(scopes.map(({ actor, admin }) => ({ id: actor.entityId, admin }))).toEqual([
    { id: f.alice, admin: true },
    { id: f.bob, admin: false },
    { id: f.outsider, admin: true },
  ]);
  expect(
    await rejection(workspaceContext(f.db, { userId: "bob", organizationId: f.orgB })),
  ).toBeInstanceOf(AccessDeniedError);
  await f.db.update(member).set({ role: "admin" }).where(eq(member.id, "bob-a"));
  expect((await workspaceContext(f.db, { userId: "bob", organizationId: f.orgA })).admin).toBe(
    true,
  );
});

test("workspace lookups use the calling transaction's membership state", async () => {
  await f.verifyEmails();
  const scope = { userId: "bob", organizationId: f.orgA };
  expect((await workspaceContext(f.db, scope)).admin).toBe(false);
  const failure = new Error("rollback role change");
  expect(
    await rejection(
      f.db.transaction(async (tx) => {
        await tx.update(member).set({ role: "admin" }).where(eq(member.id, "bob-a"));
        expect((await workspaceContext(tx, scope)).admin).toBe(true);
        expect((await workspaceContext(f.db, scope)).admin).toBe(false);
        throw failure;
      }),
    ),
  ).toBe(failure);
  expect((await workspaceContext(f.db, scope)).admin).toBe(false);
});

test("human workspace names use the joined user without another name lookup", async () => {
  await f.verifyEmails();
  await f.db.update(user).set({ name: "Alice renamed" }).where(eq(user.id, "alice"));
  const queries: string[] = [];
  const db = drizzle(f.db.$client, {
    logger: { logQuery: (query) => queries.push(query) },
  });
  const result = await workspaceContext(db, { userId: "alice", organizationId: f.orgA });
  expect(result).toMatchObject({
    userName: "Alice renamed",
    actor: { entityId: f.alice, name: "Alice renamed", type: "human" },
  });
  expect(queries).toHaveLength(1);
  expect(queries[0]).not.toContain("SELECT dn_user.name");
});

test("human workspace names preserve provisioning when the actor is missing", async () => {
  await f.db.insert(user).values({
    id: "new-member",
    name: "New member",
    email: "new@example.com",
    emailVerified: true,
  });
  await f.db.insert(member).values({
    id: "new-member-a",
    userId: "new-member",
    organizationId: f.orgA,
  });
  const result = await workspaceContext(f.db, { userId: "new-member", organizationId: f.orgA });
  expect(result).toMatchObject({
    userName: "New member",
    actor: { name: "New member", type: "human" },
  });
  expect(
    await f.db.select().from(actors).where(eq(actors.entityId, result.actor.entityId)),
  ).toEqual([
    expect.objectContaining({ userId: "new-member", organizationId: f.orgA, type: "human" }),
  ]);
});

test("agent workspace names remain distinct from the owner's name", async () => {
  await f.verifyEmails();
  const [agent] = await f.db
    .insert(userAgents)
    .values({ userId: "alice", name: "Writer", instructions: "", harness: "opencode" })
    .returning();
  const actor = await ensureUserAgentActor(f.db, {
    organizationId: f.orgA,
    userId: "alice",
    userAgentId: agent!.id,
  });
  expect(
    await workspaceContext(f.db, {
      userId: "alice",
      organizationId: f.orgA,
      actorEntityId: actor.entityId,
    }),
  ).toMatchObject({
    userName: "Alice",
    actor: { entityId: actor.entityId, name: "Writer", type: "agent" },
  });
});

test("owner-device configuration checks verified identity without borrowing a workspace", async () => {
  const repositories = createRepositories(f.db);
  expect(await rejection(repositories.forOwnerSession({ userId: "alice" }))).toBeInstanceOf(
    AccessDeniedError,
  );
  await f.verifyEmails();
  await f.db.delete(member).where(eq(member.id, "alice-a"));
  expect(
    await (await repositories.forOwnerSession({ userId: "alice" })).agents.list(),
  ).toMatchObject({ agents: [] });
  expect(
    await rejection(repositories.forSession({ userId: "alice", organizationId: f.orgA })),
  ).toBeInstanceOf(AccessDeniedError);
});

test("task sessions reject unverified users, missing memberships and inactive actors", async () => {
  expect(await rejection(f.forSession("alice"))).toBeInstanceOf(AccessDeniedError);
  await f.verifyEmails();
  const repositories = await f.forSession("alice");
  expect(
    await repositories.tasks.list(
      (await repositories.projects.create({ name: "Verified" })).result.entityId,
    ),
  ).toEqual([]);
  await f.db.update(actors).set({ disabledAt: new Date() }).where(eq(actors.entityId, f.alice));
  expect(await rejection(f.forSession("alice"))).toBeInstanceOf(AccessDeniedError);
  await f.db.update(actors).set({ disabledAt: null }).where(eq(actors.entityId, f.alice));
  await f.db.delete(member).where(eq(member.id, "alice-a"));
  expect(await rejection(f.forSession("alice"))).toBeInstanceOf(AccessDeniedError);
});

test("actorCanAccess checks levels, inherited task access, actor activity and organization", async () => {
  const repositories = f.forActor(f.alice);
  const project = await repositories.projects.create({ name: "Shared" });
  const task = await repositories.tasks.create({
    projectEntityId: project.entityId,
    title: "Child",
  });
  const ctx = new RepositoryContext(f.db, { organizationId: f.orgA, actorEntityId: f.alice });
  expect(await ctx.actorCanAccess(f.bob, task.entityId, "view")).toBe(false);
  await repositories.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  expect(await ctx.actorCanAccess(f.bob, task.entityId, "view")).toBe(true);
  expect(await ctx.actorCanAccess(f.bob, task.entityId, "edit")).toBe(false);
  expect(await ctx.actorCanAccess(f.outsider, task.entityId, "view")).toBe(false);
  await f.db.update(actors).set({ disabledAt: new Date() }).where(eq(actors.entityId, f.bob));
  expect(await ctx.actorCanAccess(f.bob, task.entityId, "view")).toBe(false);
  expect(await ctx.actorCanAccess(f.alice, task.entityId, "owner")).toBe(true);
  await repositories.entities.softDelete(project.entityId);
  expect(await ctx.actorCanAccess(f.alice, task.entityId, "view")).toBe(false);
});

test("session transactions keep messaging and work in the same transaction", async () => {
  await f.verifyEmails();
  const repositories = await f.forSession("alice");
  const { result: conversation } = await repositories.messaging.createConversation({
    kind: "channel",
    name: "Launch",
  });
  const failure = new Error("rollback");
  expect(
    await rejection(
      repositories.transaction(async (tx) => {
        const project = await tx.projects.create({ name: "Rolled back" });
        await tx.tasks.create({ projectEntityId: project.entityId, title: "Rolled back task" });
        await tx.messaging.sendMessage(conversation.id, "Rolled back message");
        throw failure;
      }),
    ),
  ).toBe(failure);
  expect(await repositories.projects.list()).toEqual([]);
  expect(await repositories.messaging.listMessages(conversation.id)).toEqual([]);
});
