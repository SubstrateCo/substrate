import { AccessDeniedError } from "../../errors";
import { createRepositories } from "../../repositories";
import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { actors } from "../actors/schema";
import { member } from "../organizations/schema";
import { RepositoryContext } from "../repository-context";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();

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
