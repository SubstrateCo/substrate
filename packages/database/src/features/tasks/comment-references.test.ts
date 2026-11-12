import { AccessDeniedError, ValidationError } from "../../errors";
import { ActorRepositories } from "../../repositories";
import { setupDatabase } from "../../testing/database";
import { recordQueries } from "../../testing/queries";
import { rejection } from "../../testing/rejection";
import { notifications } from "../notifications/schema";
import { taskCommentReferences } from "./comment-references.schema";
import { taskComments } from "./comments.schema";
import { expect, test } from "bun:test";

const fixture = setupDatabase();

async function workspace() {
  const alice = fixture.forActor(fixture.alice);
  const bob = fixture.forActor(fixture.bob);
  const shared = await alice.projects.create({ name: "Shared" });
  const hidden = await alice.projects.create({ name: "Hidden" });
  await alice.permissions.grant({
    entityId: shared.entityId,
    actorEntityId: fixture.bob,
    level: "comment",
  });
  const task = await alice.tasks.create({ projectEntityId: shared.entityId, title: "Ship" });
  const other = await alice.tasks.create({ projectEntityId: shared.entityId, title: "Other" });
  const secret = await alice.tasks.create({ projectEntityId: hidden.entityId, title: "Secret" });
  return { alice, bob, shared, hidden, task, other, secret };
}

test("a comment saves its work references and returns them with labels", async () => {
  const { alice, shared, task, other } = await workspace();
  const body = `See @[task:${other.entityId}] in @[project:${shared.entityId}] with @[person:${fixture.bob}]`;
  const comment = await alice.tasks.addComment(task.entityId, body);
  expect(
    (await fixture.db.select().from(taskCommentReferences))
      .map((row) => ({ commentId: row.commentId, entityId: row.entityId, type: row.entityType }))
      .sort((a, b) => a.type.localeCompare(b.type)),
  ).toEqual([
    { commentId: comment.id, entityId: shared.entityId, type: "project" },
    { commentId: comment.id, entityId: other.entityId, type: "task" },
  ]);
  const [listed] = await alice.tasks.listComments(task.entityId, shared.entityId);
  expect(listed!.references).toEqual([
    { id: other.entityId, kind: "task", label: "Other", projectEntityId: shared.entityId },
    { id: shared.entityId, kind: "project", label: "Shared", projectEntityId: shared.entityId },
    { id: fixture.bob, kind: "person", label: "Bob" },
  ]);
});

test("a mention alerts the person once, on the task, and never the author", async () => {
  await fixture.verifyEmails();
  const { alice, task } = await workspace();
  const comment = await alice.tasks.addComment(
    task.entityId,
    `@[person:${fixture.bob}] and @[person:${fixture.alice}] and @[person:${fixture.bob}]`,
  );
  expect(comment.notified).toEqual([fixture.bob]);
  expect(
    (await fixture.db.select().from(notifications)).map((row) => ({
      recipient: row.recipientActorEntityId,
      kind: row.kind,
      entityId: row.entityId,
      eventKey: row.eventKey,
    })),
  ).toEqual([
    { recipient: fixture.bob, kind: "mention", entityId: task.entityId, eventKey: comment.id },
  ]);
});

test("mention access checks do not add one statement per person", async () => {
  await fixture.verifyEmails();
  const { task } = await workspace();
  const { db, queries } = recordQueries();
  const repos = new ActorRepositories(db, {
    organizationId: fixture.orgA,
    actorEntityId: fixture.alice,
  });
  await repos.tasks.addComment(task.entityId, `@[person:${fixture.bob}]`);
  const count = queries.length;
  queries.length = 0;
  await repos.tasks.addComment(
    task.entityId,
    `@[person:${fixture.bob}] @[person:${fixture.alice}]`,
  );
  expect(queries).toHaveLength(count);
});

test("a comment rejects references its author or its mentioned person cannot open", async () => {
  const { alice, bob, hidden, task, secret } = await workspace();
  // Bob cannot reference work he cannot view.
  for (const token of [`@[task:${secret.entityId}]`, `@[project:${hidden.entityId}]`])
    expect(await rejection(bob.tasks.addComment(task.entityId, token))).toBeInstanceOf(
      AccessDeniedError,
    );
  // A project id is not a task.
  expect(
    await rejection(alice.tasks.addComment(task.entityId, `@[task:${hidden.entityId}]`)),
  ).toBeInstanceOf(AccessDeniedError);
  // Bob cannot open the hidden project, so a comment there cannot mention him.
  expect(
    await rejection(alice.tasks.addComment(secret.entityId, `@[person:${fixture.bob}]`)),
  ).toEqual(new ValidationError("Mention only people who can open this task."));
  // Another organization's person is not a person here.
  expect(
    await rejection(alice.tasks.addComment(task.entityId, `@[person:${fixture.outsider}]`)),
  ).toBeInstanceOf(ValidationError);
  expect(
    await rejection(alice.tasks.addComment(task.entityId, `@[channel:${crypto.randomUUID()}]`)),
  ).toBeInstanceOf(ValidationError);
  // A rejected reference keeps no comment, reference, or alert.
  expect(await fixture.db.select().from(taskComments)).toEqual([]);
  expect(await fixture.db.select().from(taskCommentReferences)).toEqual([]);
  expect(await fixture.db.select().from(notifications)).toEqual([]);
});

test("a reader gets no label for a reference they cannot open", async () => {
  const { alice, bob, shared, task, secret } = await workspace();
  await alice.tasks.addComment(task.entityId, `Blocked on @[task:${secret.entityId}]`);
  expect((await bob.tasks.listComments(task.entityId, shared.entityId))[0]!.references).toEqual([]);
  expect(
    (await alice.tasks.listComments(task.entityId, shared.entityId))[0]!.references,
  ).toMatchObject([{ id: secret.entityId, label: "Secret" }]);
});

test("comment mentions list readable commenting tasks only, without bodies", async () => {
  const { alice, bob, shared, task, other, secret } = await workspace();
  const visible = await alice.tasks.addComment(task.entityId, `Dup of @[task:${other.entityId}]`);
  await alice.tasks.addComment(secret.entityId, `Private note on @[task:${other.entityId}]`);
  await alice.tasks.addComment(other.entityId, `Self @[task:${other.entityId}]`);
  expect(await bob.tasks.commentMentions(other.entityId)).toEqual([
    {
      commentId: visible.id,
      taskEntityId: task.entityId,
      taskTitle: "Ship",
      projectEntityId: shared.entityId,
      authorName: "Alice",
      createdAt: visible.createdAt,
    },
  ]);
  expect((await alice.tasks.commentMentions(other.entityId)).map((row) => row.taskTitle)).toEqual([
    "Secret",
    "Ship",
  ]);
  expect(await rejection(bob.tasks.commentMentions(secret.entityId))).toBeInstanceOf(
    AccessDeniedError,
  );
});
