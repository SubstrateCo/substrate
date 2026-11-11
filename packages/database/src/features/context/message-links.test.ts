import { AccessDeniedError, ConflictError } from "../../errors";
import { entityGrants, tasks, taskActivity, notifications } from "../../schema";
import { contextConversation } from "../../testing/context";
import { setupDatabase } from "../../testing/database";
import { recordQueries } from "../../testing/queries";
import { messagingParticipants } from "../messaging/schema";
import { messageEntityReferences, sourceTaskRequests } from "./schema";
import { createContextService } from "./service";
/* oxlint-disable typescript/await-thenable -- Bun's rejects matchers return promises at runtime. */
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();
const context = (userId = "alice", organizationId = f.orgA) =>
  createContextService(f.db, { userId, organizationId });

const setup = () => contextConversation(f);

test("source creation is atomic, concurrent-idempotent, and preserves the exact reply without granting access", async () => {
  const { project, reply, root } = await setup();
  const before = await f.db.select().from(entityGrants);
  const input = {
    requestId: crypto.randomUUID(),
    messageId: reply.id,
    projectEntityId: project.entityId,
    title: "Ship request",
    status: "in_review" as const,
  };
  const [a, b] = await Promise.all([
    context().createTaskFromMessage(input),
    context().createTaskFromMessage(input),
  ]);
  expect(a.entityId).toBe(b.entityId);
  expect(a.description).toBe("");
  expect(a.status).toBe("in_review");
  expect(await context().related(a.entityId)).toMatchObject([
    { messageId: reply.id, threadId: root.id, purpose: "source" },
  ]);
  expect(await context().messageLinks(reply.id)).toMatchObject([
    { entityId: a.entityId, title: "Ship request", status: "in_review", statusName: "In review" },
  ]);
  expect(await f.db.select().from(entityGrants)).toEqual(before);
  expect(await f.db.select().from(sourceTaskRequests)).toHaveLength(1);
  await expect(
    context().createTaskFromMessage({ ...input, title: "Different" }),
  ).rejects.toBeInstanceOf(ConflictError);
  await expect(
    context().createTaskFromMessage({ ...input, status: "completed" }),
  ).rejects.toBeInstanceOf(ConflictError);
  const { db, queries } = recordQueries();
  await createContextService(db, { userId: "alice", organizationId: f.orgA }).createTaskFromMessage(
    { ...input, requestId: crypto.randomUUID() },
  );
  // The project lock taken for idempotency also covers the task insert.
  expect(queries.filter((query) => query.includes("FOR UPDATE"))).toHaveLength(1);
  expect(queries).toHaveLength(11);
});

test("both endpoints are required, membership revocation hides context, and linking never shares", async () => {
  const { project, reply, repos, chat, conversation } = await setup();
  const task = await context().createTaskFromMessage({
    requestId: crypto.randomUUID(),
    messageId: reply.id,
    projectEntityId: project.entityId,
    title: "Private work",
  });
  await repos.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "edit",
  });
  expect(await context("bob").related(task.entityId)).toEqual([]);
  await expect(context("bob").messageLinks(reply.id)).rejects.toBeInstanceOf(AccessDeniedError);
  await chat.addMembers(conversation.id, ["bob@example.com", "outside@example.com"]);
  expect(await context("bob").related(task.entityId)).toHaveLength(1);
  expect(await context("outsider", f.orgB).messageLinks(reply.id)).toEqual([]);
  await expect(context("outsider", f.orgB).attach(reply.id, task.entityId)).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
  await f.db.delete(messagingParticipants).where(eq(messagingParticipants.actorEntityId, f.bob));
  expect(await context("bob").related(task.entityId)).toEqual([]);
  await repos.permissions.revoke({ entityId: project.entityId, actorEntityId: f.bob });
  expect(await context("bob").search({ query: "Private", kind: "task" })).toEqual([]);
});

test("source provenance survives explicit unlinking and caller rollback removes all new work", async () => {
  const { project, reply } = await setup();
  const task = await context().createTaskFromMessage({
    requestId: crypto.randomUUID(),
    messageId: reply.id,
    projectEntityId: project.entityId,
    title: "Work",
  });
  await context().attach(reply.id, task.entityId);
  expect(await context().messageLinks(reply.id)).toHaveLength(2);
  await context().detach(reply.id, task.entityId);
  expect(await context().messageLinks(reply.id)).toMatchObject([{ purpose: "source" }]);
  await expect(
    f.db.transaction(async (tx) => {
      await createContextService(tx, {
        userId: "alice",
        organizationId: f.orgA,
      }).createTaskFromMessage({
        requestId: crypto.randomUUID(),
        messageId: reply.id,
        projectEntityId: project.entityId,
        title: "Rollback",
      });
      throw new Error("abort");
    }),
  ).rejects.toThrow("abort");
  expect((await f.forActor(f.alice).tasks.list(project.entityId)).map((t) => t.title)).toEqual([
    "Work",
  ]);
  expect(await f.db.select().from(messageEntityReferences)).toHaveLength(1);
});

test("source creation rejects task viewers and foreign or unsupported references without partial writes", async () => {
  const { project, reply, repos, conversation, chat } = await setup();
  await repos.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  await chat.addMembers(conversation.id, ["bob@example.com"]);
  await expect(
    context("bob").createTaskFromMessage({
      requestId: crypto.randomUUID(),
      messageId: reply.id,
      projectEntityId: project.entityId,
      title: "Forbidden",
    }),
  ).rejects.toBeInstanceOf(AccessDeniedError);
  const contact = await repos.contacts.create({ displayName: "Customer" });
  await expect(context().attach(reply.id, contact.entityId)).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
  expect(await f.db.select().from(tasks)).toEqual([]);
  expect(await f.db.select().from(taskActivity)).toEqual([]);
  expect(await f.db.select().from(notifications)).toEqual([]);
  await expect(
    f.db
      .insert(messageEntityReferences)
      .values({
        organizationId: f.orgA,
        conversationId: conversation.id,
        messageId: reply.id,
        entityId: contact.entityId,
        entityType: "task",
        purpose: "association",
        createdByActorEntityId: f.alice,
      })
      .execute(),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
  expect(await f.db.select().from(messageEntityReferences)).toEqual([]);
});

test("mention and explicit relationships remain independent and target rename and deletion are respected", async () => {
  const { project, repos, chat, conversation } = await setup();
  const task = await repos.tasks.create({ projectEntityId: project.entityId, title: "Before" });
  const sent = await chat.sendMessage(
    conversation.id,
    `Please review @[task:${task.entityId}] @[task:${task.entityId}]`,
  );
  await context().attach(sent.id, task.entityId);
  expect((await context().messageLinks(sent.id)).map((item) => item.purpose).sort()).toEqual([
    "association",
    "mention",
  ]);
  await context().detach(sent.id, task.entityId);
  await repos.tasks.update(task.entityId, { title: "After" });
  expect(await context().messageLinks(sent.id)).toMatchObject([
    { purpose: "mention", title: "After" },
  ]);
  await repos.entities.softDelete(task.entityId);
  expect(await context().messageLinks(sent.id)).toEqual([]);
});
