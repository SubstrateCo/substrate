import { realtimeKeys } from "@substrate/contracts/realtime";

import { user } from "../../core/authentication/schema";
import { RepositoryEffects } from "../../core/effects";
import { RepositoryContext } from "../../core/repository-context";
import { AccessDeniedError, ValidationError } from "../../errors";
import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { sendMessageAs } from "../messaging/messages/messages";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();

test("self assignment and unchanged assignment emit no notification hint", async () => {
  await f.verifyEmails();
  const repos = f.forActor(f.alice);
  const project = await repos.projects.create({ name: "Effects" });
  const created = await repos.transaction((tx) =>
    tx.tasks.create({
      projectEntityId: project.entityId,
      title: "Mine",
      assigneeActorEntityId: f.alice,
    }),
  );
  expect(created.hints).toEqual([
    {
      audience: realtimeKeys.entity(f.orgA, project.entityId),
      domain: "tasks",
      projectId: project.entityId,
      taskIds: [created.result.entityId],
    },
  ]);
  const unchanged = await repos.transaction((tx) =>
    tx.tasks.update(created.result.entityId, { assigneeActorEntityId: f.alice }),
  );
  expect(unchanged.hints).toEqual([]);
  await repos.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  const assigned = await repos.transaction((tx) =>
    tx.tasks.update(created.result.entityId, { assigneeActorEntityId: f.bob }),
  );
  expect(assigned.hints).toContainEqual({
    audience: realtimeKeys.actor(f.orgA, f.bob),
    domain: "notifications",
  });
  const reassigned = await repos.transaction((tx) =>
    tx.tasks.update(created.result.entityId, { assigneeActorEntityId: f.bob }),
  );
  expect(reassigned.hints).toEqual([]);
});

test("an inaccessible mention rolls back the discussion message and its effects", async () => {
  await f.verifyEmails();
  const repos = f.forActor(f.alice);
  const project = await repos.projects.create({ name: "Private" });
  const task = await repos.tasks.create({ projectEntityId: project.entityId, title: "Private" });
  const conversationId = await repos.tasks.ensureDiscussion(task.entityId);
  const ctx = new RepositoryContext(
    f.db,
    { organizationId: f.orgA, actorEntityId: f.alice },
    new RepositoryEffects(),
  );
  expect(
    await rejection(
      ctx.transaction(async (tx) => {
        return sendMessageAs(
          tx,
          { organizationId: f.orgA, userId: "alice" },
          { actor: { entityId: f.alice, type: "human" }, authorName: "Alice" },
          { conversationId, body: `@[person:${f.bob}]` },
        );
      }),
    ),
  ).toBeInstanceOf(AccessDeniedError);
  expect(ctx.effects.committed(null).hints).toEqual([]);
  expect(await f.messaging("alice").listMessages(conversationId)).toEqual([]);
});

test("moving tasks and deleting projects emit access hints; deleting a task refreshes its project", async () => {
  const repos = f.forActor(f.alice);
  const first = await repos.projects.create({ name: "First" });
  const second = await repos.projects.create({ name: "Second" });
  const task = await repos.tasks.create({ projectEntityId: first.entityId, title: "Move" });
  const access = { audience: realtimeKeys.organization(f.orgA), domain: "access" as const };
  const moved = await repos.transaction((tx) =>
    tx.tasks.move(task.entityId, first.entityId, second.entityId, null),
  );
  expect(moved.hints).toContainEqual(access);
  const deleted = await repos.transaction((tx) => tx.tasks.delete(task.entityId, second.entityId));
  expect(deleted.hints).toEqual([
    access,
    {
      audience: realtimeKeys.entity(f.orgA, second.entityId),
      domain: "tasks",
      projectId: second.entityId,
    },
  ]);
  await repos.projects.archive(first.entityId);
  const projectDeleted = await repos.transaction((tx) => tx.projects.delete(first.entityId));
  expect(projectDeleted.hints).toEqual([access]);
});

test("project edits name only their own project", async () => {
  await f.verifyEmails();
  const repos = f.forActor(f.alice);
  const project = await repos.projects.create({ name: "Named" });
  const work = {
    audience: realtimeKeys.entity(f.orgA, project.entityId),
    domain: "tasks" as const,
    projectId: project.entityId,
  };
  const renamed = await repos.transaction((tx) =>
    tx.projects.update(project.entityId, { name: "Renamed", description: "" }),
  );
  expect(renamed.hints).toEqual([work]);
});

test("unverified recipients get neither assignment nor mention notification hints", async () => {
  await f.verifyEmails();
  await f.db.update(user).set({ emailVerified: false }).where(eq(user.id, "bob"));
  const repos = f.forActor(f.alice);
  const project = await repos.projects.create({ name: "Verified recipients" });
  await repos.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  const created = await repos.transaction((tx) =>
    tx.tasks.create({
      projectEntityId: project.entityId,
      title: "Assign",
      assigneeActorEntityId: f.bob,
    }),
  );
  expect(created.hints.filter((hint) => hint.domain === "notifications")).toEqual([]);
  const conversationId = await repos.tasks.ensureDiscussion(created.result.entityId);
  const ctx = new RepositoryContext(
    f.db,
    { organizationId: f.orgA, actorEntityId: f.alice },
    new RepositoryEffects(),
  );
  await ctx.transaction((tx) =>
    sendMessageAs(
      tx,
      { organizationId: f.orgA, userId: "alice" },
      { actor: { entityId: f.alice, type: "human" }, authorName: "Alice" },
      { conversationId, body: `@[person:${f.bob}]` },
    ),
  );
  expect(
    ctx.effects.committed(null).hints.filter((hint) => hint.domain === "notifications"),
  ).toEqual([]);
});

test("a caught savepoint failure does not leak its hints into the committed transaction", async () => {
  const repos = f.forActor(f.alice);
  const project = await repos.projects.create({ name: "Rollback" });
  const committed = await repos.transaction(async (tx) => {
    await rejection(
      tx.transaction(async (nested) => {
        await nested.tasks.create({ projectEntityId: project.entityId, title: "Rolled back" });
        throw new ValidationError("Abort savepoint");
      }),
    );
    return tx.tasks.list(project.entityId);
  });
  expect(committed).toEqual({ result: [], hints: [] });
});
