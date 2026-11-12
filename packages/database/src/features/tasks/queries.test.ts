import { user } from "../../core/authentication/schema";
import { entities } from "../../core/entities/schema";
import { RepositoryContext } from "../../core/repository-context";
import { setupDatabase } from "../../testing/database";
import { recordQueries } from "../../testing/queries";
import { messageEntityReferences } from "../context/schema";
import { queryTaskDetail, queryTasks } from "./queries";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();

test("task lists join current assignee names without per-task identity subplans", async () => {
  const alice = f.forActor(f.alice);
  const project = await alice.projects.create({ name: "Assignees" });
  const task = await alice.tasks.create({
    projectEntityId: project.entityId,
    title: "Assigned",
    assigneeActorEntityId: f.alice,
  });
  const unassigned = await alice.tasks.create({
    projectEntityId: project.entityId,
    title: "Unassigned",
  });
  await f.db.update(user).set({ name: "Renamed" }).where(eq(user.id, "alice"));
  const { db, queries, parameters } = recordQueries();
  const ctx = new RepositoryContext(db, { organizationId: f.orgA, actorEntityId: f.alice });
  const rows = await queryTasks(ctx, { projectEntityId: project.entityId });
  expect(rows.find((row) => row.task.entityId === task.entityId)?.assignee).toEqual({
    id: f.alice,
    name: "Renamed",
    type: "human",
  });
  expect(rows.find((row) => row.task.entityId === unassigned.entityId)?.assignee).toBeNull();
  expect(queries).toHaveLength(2);
  const plan = await f.db.$client.unsafe(
    `explain (format json) ${queries[1]}`,
    // SAFETY: the logger records the same values Drizzle binds to this statement.
    parameters[1] as never[],
  );
  const serializedPlan = JSON.stringify(plan);
  expect(serializedPlan).not.toContain('"Alias":"dn_user"');
  expect(serializedPlan).not.toContain('"Alias":"dn_agent"');
});

test("task detail loads counts and the first visible source in one statement", async () => {
  await f.verifyEmails();
  const alice = f.forActor(f.alice);
  const project = await alice.projects.create({ name: "Detail" });
  const task = await alice.tasks.create({ projectEntityId: project.entityId, title: "Parent" });
  const child = await alice.tasks.create({
    projectEntityId: project.entityId,
    parentTaskEntityId: task.entityId,
    title: "Child",
  });
  const liveChild = await alice.tasks.create({
    projectEntityId: project.entityId,
    parentTaskEntityId: task.entityId,
    title: "Live child",
  });
  await f.db
    .update(entities)
    .set({ deletedAt: new Date() })
    .where(eq(entities.entityId, child.entityId));
  await alice.tasks.addComment(task.entityId, "One comment");
  const messaging = f.messaging("alice");
  const visible = await messaging.createConversation({ kind: "channel", name: "visible" });
  const hidden = await messaging.createConversation({
    kind: "channel",
    name: "hidden",
    private: true,
  });
  const first = await messaging.sendMessage(visible.id, "First source");
  const second = await messaging.sendMessage(visible.id, "Second source");
  const secret = await messaging.sendMessage(hidden.id, "Hidden source");
  await alice.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  await f.db.insert(messageEntityReferences).values([
    ...[first, second, secret].map((message, index) => ({
      organizationId: f.orgA,
      conversationId: message.conversationId,
      messageId: message.id,
      entityId: task.entityId,
      entityType: "task" as const,
      purpose: "source" as const,
      createdByActorEntityId: f.alice,
      createdAt: new Date(index === 2 ? "2026-01-01" : `2026-01-0${index + 2}`),
    })),
    {
      organizationId: f.orgA,
      conversationId: visible.id,
      messageId: first.id,
      entityId: task.entityId,
      entityType: "task",
      purpose: "association",
      createdByActorEntityId: f.alice,
    },
  ]);
  const { db, queries } = recordQueries();
  const ctx = new RepositoryContext(db, { organizationId: f.orgA, actorEntityId: f.bob });
  const identity = { organizationId: f.orgA, userId: "bob" };
  const result = await queryTaskDetail(ctx, identity, task);
  expect(result).toMatchObject({
    detail: {
      projectName: "Detail",
      subtaskCount: 1,
      commentCount: 1,
      parent: null,
      assignee: null,
    },
    linkedMessageCount: 2,
    source: { id: first.id, conversationId: visible.id, threadId: null },
  });
  expect(queries).toHaveLength(1);
  queries.length = 0;
  const empty = await queryTaskDetail(ctx, identity, liveChild);
  expect(empty).toMatchObject({
    detail: { parent: { id: task.entityId, title: "Parent" }, subtaskCount: 0, commentCount: 0 },
    linkedMessageCount: 0,
    source: undefined,
  });
  expect(queries).toHaveLength(1);
});
