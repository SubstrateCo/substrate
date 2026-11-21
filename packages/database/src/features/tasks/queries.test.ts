import { userAgents } from "../../core/actors/user-agents.schema";
import { user } from "../../core/authentication/schema";
import { entities } from "../../core/entities/schema";
import { RepositoryContext } from "../../core/repository-context";
import { ownedAgent } from "../../testing/agents";
import { setupDatabase } from "../../testing/database";
import { recordQueries } from "../../testing/queries";
import { taskActivity } from "../activity/schema";
import { messageEntityReferences } from "../context/schema";
import { queryTaskActivity, queryTaskDetail, queryTasks } from "./queries";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();

test("task export pages use stable IDs and exclude deleted tasks and other projects", async () => {
  const alice = f.forActor(f.alice);
  const project = await alice.projects.create({ name: "Export" });
  const other = await alice.projects.create({ name: "Other" });
  const records = [];
  for (let i = 0; i < 4; i++)
    records.push(
      await alice.tasks.create({ projectEntityId: project.entityId, title: `Task ${i}` }),
    );
  await alice.tasks.create({ projectEntityId: other.entityId, title: "Hidden" });
  await alice.tasks.delete(records[0]!.entityId, project.entityId);
  const expected = records
    .slice(1)
    .map((row) => row.entityId)
    .sort();
  const ctx = new RepositoryContext(f.db, { organizationId: f.orgA, actorEntityId: f.alice });
  const first = await queryTasks(ctx, {
    projectEntityId: project.entityId,
    ascending: true,
    limit: 2,
  });
  const second = await queryTasks(ctx, {
    projectEntityId: project.entityId,
    ascending: true,
    limit: 2,
    afterEntityId: first.at(-1)!.task.entityId,
  });
  expect([...first, ...second].map((row) => row.task.entityId)).toEqual(expected);
  expect(f.forActor(f.bob).tasks.exportPage(project.entityId)).rejects.toThrow();
});

test("task activity uses joined current human and agent names", async () => {
  const agent = await ownedAgent(f);
  const alice = f.forActor(f.alice);
  const project = await alice.projects.create({ name: "Labels" });
  const task = await alice.tasks.create({ projectEntityId: project.entityId, title: "Target" });
  await f.db.insert(taskActivity).values({
    organizationId: f.orgA,
    taskEntityId: task.entityId,
    actorEntityId: agent.actorId,
    action: "Agent event",
  });
  await f.db.update(user).set({ name: "New human name" }).where(eq(user.id, "alice"));
  await f.db
    .update(userAgents)
    .set({ name: "New agent name" })
    .where(eq(userAgents.id, agent.agentId));
  const { db, queries } = recordQueries();
  const activity = await queryTaskActivity(
    new RepositoryContext(db, {
      organizationId: f.orgA,
      actorEntityId: f.alice,
    }),
    { organizationId: f.orgA, userId: "alice" },
    task.entityId,
  );
  expect(activity.find((row) => row.actor.id === agent.actorId)?.actor.name).toBe("New agent name");
  expect(activity.find((row) => row.actor.id === f.alice)?.actor.name).toBe("New human name");
  const metadata = queries.filter(
    (query) => query.includes('left join "user"') && query.includes('left join "user_agents"'),
  );
  expect(metadata).toHaveLength(1);
  expect(metadata[0]).not.toMatch(/select\s+dn_(?:user|agent)\./i);
});

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
  const rows = await queryTasks(
    new RepositoryContext(db, { organizationId: f.orgA, actorEntityId: f.alice }),
    { projectEntityId: project.entityId },
  );
  expect(rows.find((row) => row.task.entityId === task.entityId)?.assignee).toEqual({
    id: f.alice,
    name: "Renamed",
    type: "human",
  });
  expect(rows.find((row) => row.task.entityId === unassigned.entityId)?.assignee).toBeNull();
  expect(queries).toHaveLength(2);
  const plan = await f.db.$client.unsafe(
    `explain (format json) ${queries[1]}`,
    // SAFETY: these are the values recorded for this statement.
    parameters[1] as never[],
  );
  const serializedPlan = JSON.stringify(plan);
  expect(serializedPlan).not.toContain('"Alias":"dn_user"');
  expect(serializedPlan).not.toContain('"Alias":"dn_agent"');
});

test("task detail loads structural discussion, counts and first visible source in one statement", async () => {
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
  const discussionConversationId = await alice.tasks.ensureDiscussion(task.entityId);
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
  expect(await queryTaskDetail(ctx, identity, task)).toMatchObject({
    detail: {
      projectName: "Detail",
      subtaskCount: 1,
      discussionConversationId,
      parent: null,
      assignee: null,
    },
    linkedMessageCount: 2,
    source: { id: first.id, conversationId: visible.id, threadId: null },
  });
  expect(queries).toHaveLength(1);
  queries.length = 0;
  expect(await queryTaskDetail(ctx, identity, liveChild)).toMatchObject({
    detail: {
      parent: { id: task.entityId, title: "Parent" },
      subtaskCount: 0,
      discussionConversationId: null,
    },
    linkedMessageCount: 0,
    source: undefined,
  });
  expect(queries).toHaveLength(1);
});
