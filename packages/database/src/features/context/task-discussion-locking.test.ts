import { permissionRepository } from "../../core/permissions/repository";
import { RepositoryContext } from "../../core/repository-context";
import { AccessDeniedError } from "../../errors";
import * as schema from "../../schema";
import { discardEffects } from "../../testing/connection";
import { setupDatabase } from "../../testing/database";
import { createMessagingService } from "../messaging/service";
import { createContextService } from "./service";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";

const f = setupDatabase();

function observeAccessLock(attempted: PromiseWithResolvers<void>) {
  return discardEffects(
    drizzle(f.db.$client, {
      schema,
      logger: {
        logQuery: (query) => {
          if (query.includes("WITH access_paths")) attempted.resolve();
        },
      },
    }),
  );
}

test("attaching a discussion message and editing it use the same access-before-message lock order", async () => {
  await f.verifyEmails();
  const alice = f.forActor(f.alice);
  const project = await alice.projects.create({ name: "Locks" });
  const task = await alice.tasks.create({ projectEntityId: project.entityId, title: "Source" });
  const target = await alice.tasks.create({ projectEntityId: project.entityId, title: "Target" });
  const conversationId = await alice.tasks.ensureDiscussion(task.entityId);
  const message = await f.messaging("alice").sendMessage(conversationId, "Before");
  const attempted = Promise.withResolvers<void>();
  const observed = observeAccessLock(attempted);
  const identity = { organizationId: f.orgA, userId: "alice" };
  const { pending } = await f.db.transaction(async (tx) => {
    const ctx = new RepositoryContext(tx, { organizationId: f.orgA, actorEntityId: f.alice });
    await ctx.requireAccess(task.entityId, "comment", true);
    const pending = createContextService(observed, identity).attach(message.id, target.entityId);
    await attempted.promise;
    // The other connection is waiting for our task lock. It must not hold the message lock.
    await createMessagingService(tx, identity).editMessage(message.id, "After");
    return { pending };
  });
  expect(await pending).toBe(true);
  expect((await f.messaging("alice").listMessages(conversationId))[0]?.body).toBe("After");
  expect(await f.context("alice").messageLinks(message.id)).toMatchObject([
    { entityId: target.entityId },
  ]);
});

test("creating from a discussion rechecks source access after waiting for its destination", async () => {
  await f.verifyEmails();
  const alice = f.forActor(f.alice);
  const projects = await Promise.all([
    alice.projects.create({ name: "One" }),
    alice.projects.create({ name: "Two" }),
  ]);
  projects.sort((a, b) => a.entityId.localeCompare(b.entityId));
  const [destination, source] = projects;
  await alice.permissions.grant({
    entityId: source!.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  await alice.permissions.grant({
    entityId: destination!.entityId,
    actorEntityId: f.bob,
    level: "edit",
  });
  const task = await alice.tasks.create({ projectEntityId: source!.entityId, title: "Source" });
  const conversationId = await alice.tasks.ensureDiscussion(task.entityId);
  const message = await f.messaging("alice").sendMessage(conversationId, "Evidence");
  const attempted = Promise.withResolvers<void>();
  const observed = observeAccessLock(attempted);
  const { pending } = await f.db.transaction(async (tx) => {
    const ctx = new RepositoryContext(tx, { organizationId: f.orgA, actorEntityId: f.alice });
    await ctx.requireAccess(destination!.entityId, "edit", true);
    const pending = createContextService(observed, { organizationId: f.orgA, userId: "bob" })
      .createTaskFromMessage({
        requestId: crypto.randomUUID(),
        messageId: message.id,
        projectEntityId: destination!.entityId,
        title: "Must not exist",
      })
      .then(
        () => null,
        (error: Error) => error,
      );
    await attempted.promise;
    await permissionRepository(ctx).revoke({ entityId: source!.entityId, actorEntityId: f.bob });
    return { pending };
  });
  expect(await pending).toBeInstanceOf(AccessDeniedError);
  expect(await alice.tasks.list(destination!.entityId)).toEqual([]);
  expect(await f.db.select().from(schema.idempotentRequests)).toEqual([]);
  expect(
    await f.db
      .select()
      .from(schema.messageEntityReferences)
      .where(eq(schema.messageEntityReferences.messageId, message.id)),
  ).toEqual([]);
});
