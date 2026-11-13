import { realtimeKeys } from "@substrate/contracts/realtime";

import { AccessDeniedError, ConflictError } from "../../errors";
import { entityGrants, idempotentRequests, tasks, taskActivity, notifications } from "../../schema";
import { contextConversation } from "../../testing/context";
import { setupDatabase } from "../../testing/database";
import { recordQueries } from "../../testing/queries";
import { rejection } from "../../testing/rejection";
import { messagingParticipants } from "../messaging/schema";
import { messageEntityReferences } from "./schema";
import { createContextService } from "./service";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();
const context = f.context;

const setup = () => contextConversation(f);

test("reference hints name the message to its conversation and the work to its readers", async () => {
  const { repos, project, conversation, reply } = await setup();
  const task = await repos.tasks.create({ projectEntityId: project.entityId, title: "Linked" });
  const alice = await f.forSession("alice");
  const pages = {
    audience: realtimeKeys.conversation(conversation.id),
    domain: "context" as const,
    messageId: reply.id,
  };
  const related = {
    audience: realtimeKeys.entity(f.orgA, project.entityId),
    domain: "context" as const,
    projectId: project.entityId,
    taskIds: [task.entityId],
  };
  for (const change of [
    await alice.context.attach(reply.id, task.entityId),
    await alice.context.detach(reply.id, task.entityId),
  ]) {
    expect(change.hints).toContainEqual(pages);
    expect(change.hints).toContainEqual(related);
    // The private channel's message and the project's task never go to the whole workspace.
    expect(change.hints.filter((hint) => hint.audience[0] === "organization")).toEqual([]);
  }
});

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
  expect(await f.db.select().from(idempotentRequests)).toHaveLength(1);
  expect(
    await rejection(context().createTaskFromMessage({ ...input, title: "Different" })),
  ).toBeInstanceOf(ConflictError);
  expect(
    await rejection(context().createTaskFromMessage({ ...input, status: "completed" })),
  ).toBeInstanceOf(ConflictError);
  const { db, queries } = recordQueries();
  await createContextService(db, { userId: "alice", organizationId: f.orgA }).createTaskFromMessage(
    { ...input, requestId: crypto.randomUUID() },
  );
  // The project lock taken for idempotency also covers the task insert.
  expect(queries.filter((query) => query.includes("FOR NO KEY UPDATE"))).toHaveLength(1);
  // Source validation now also locks and rechecks the conversation against concurrent deletion,
  // and the request identity takes its own advisory lock.
  expect(queries).toHaveLength(15);
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
  expect(await rejection(context("bob").messageLinks(reply.id))).toBeInstanceOf(AccessDeniedError);
  await chat.addMembers(conversation.id, ["bob@example.com", "outside@example.com"]);
  expect(await context("bob").related(task.entityId)).toHaveLength(1);
  expect(await context("outsider", f.orgB).messageLinks(reply.id)).toEqual([]);
  expect(
    await rejection(context("outsider", f.orgB).attach(reply.id, task.entityId)),
  ).toBeInstanceOf(AccessDeniedError);
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
  expect(
    await rejection(
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
    ),
  ).toMatchObject({ message: expect.stringContaining("abort") });
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
  expect(
    await rejection(
      context("bob").createTaskFromMessage({
        requestId: crypto.randomUUID(),
        messageId: reply.id,
        projectEntityId: project.entityId,
        title: "Forbidden",
      }),
    ),
  ).toBeInstanceOf(AccessDeniedError);
  const person = f.alice;
  expect(await rejection(context().attach(reply.id, person))).toBeInstanceOf(AccessDeniedError);
  const contact = await repos.contacts.create({ displayName: "Customer" });
  expect(await f.db.select().from(tasks)).toEqual([]);
  expect(await f.db.select().from(taskActivity)).toEqual([]);
  expect(await f.db.select().from(notifications)).toEqual([]);
  expect(
    await rejection(
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
    ),
  ).toMatchObject({ cause: { code: "23503" } });
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
