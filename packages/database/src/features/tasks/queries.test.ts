import { userAgents } from "../../core/actors/user-agents.schema";
import { user } from "../../core/authentication/schema";
import { entities } from "../../core/entities/schema";
import { member } from "../../core/organizations/schema";
import { RepositoryContext } from "../../core/repository-context";
import { ActorRepositories } from "../../repositories";
import { storedFiles } from "../../schema";
import { ownedAgent } from "../../testing/agents";
import { setupDatabase } from "../../testing/database";
import { recordQueries } from "../../testing/queries";
import { taskActivity } from "../activity/schema";
import { messageEntityReferences } from "../context/schema";
import { commentReferences } from "./comment-references";
import { taskCommentReferences } from "./comment-references.schema";
import { taskComments } from "./comments.schema";
import { queryTaskActivity, queryTaskComments, queryTaskDetail, queryTasks } from "./queries";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();

test("task activity, mention authors and reference labels use joined current names", async () => {
  const agent = await ownedAgent(f);
  const alice = f.forActor(f.alice);
  const project = await alice.projects.create({ name: "Labels" });
  const target = await alice.tasks.create({ projectEntityId: project.entityId, title: "Target" });
  const source = await alice.tasks.create({ projectEntityId: project.entityId, title: "Source" });
  const comments = await f.db
    .insert(taskComments)
    .values(
      [f.alice, agent.actorId].map((authorActorEntityId) => ({
        organizationId: f.orgA,
        taskEntityId: source.entityId,
        authorActorEntityId,
        body: `@[task:${target.entityId}]`,
      })),
    )
    .returning();
  await f.db.insert(taskCommentReferences).values(
    comments.map((comment) => ({
      organizationId: f.orgA,
      commentId: comment.id,
      entityId: target.entityId,
      entityType: "task" as const,
    })),
  );
  await f.db.insert(taskActivity).values({
    organizationId: f.orgA,
    taskEntityId: target.entityId,
    actorEntityId: agent.actorId,
    action: "Agent event",
  });
  await f.db.update(user).set({ name: "New human name" }).where(eq(user.id, "alice"));
  await f.db
    .update(userAgents)
    .set({ name: "New agent name" })
    .where(eq(userAgents.id, agent.agentId));
  const { db, queries } = recordQueries();
  const scope = { organizationId: f.orgA, actorEntityId: f.alice };
  const ctx = new RepositoryContext(db, scope);
  const references = await commentReferences(ctx, [
    `@[person:${f.alice}] @[agent:${agent.actorId}]`,
  ]);
  expect(references).toEqual([
    [
      { id: f.alice, kind: "person", label: "New human name" },
      { id: agent.actorId, kind: "agent", label: "New agent name" },
    ],
  ]);
  const mentions = await new ActorRepositories(db, scope).tasks.commentMentions(target.entityId);
  expect(mentions.map((row) => row.authorName).sort()).toEqual([
    "New agent name",
    "New human name",
  ]);
  const activity = await queryTaskActivity(
    ctx,
    { organizationId: f.orgA, userId: "alice" },
    target.entityId,
  );
  expect(activity.find((row) => row.actor.id === agent.actorId)?.actor.name).toBe("New agent name");
  expect(activity.find((row) => row.actor.id === f.alice)?.actor.name).toBe("New human name");
  const metadataQueries = queries.filter(
    (query) => query.includes('left join "user"') && query.includes('left join "user_agents"'),
  );
  expect(metadataQueries).toHaveLength(3);
  for (const query of metadataQueries) expect(query).not.toMatch(/select\s+dn_(?:user|agent)\./i);
});

test("comment metadata joins preserve managed pictures and owner-only agent pictures for actor scopes", async () => {
  const agent = await ownedAgent(f);
  const project = await f.forActor(f.alice).projects.create({ name: "Pictures" });
  const task = await f
    .forActor(f.alice)
    .tasks.create({ projectEntityId: project.entityId, title: "Comments" });
  const humanImage = `/api/v1/files/pictures/avatar/alice?v=${crypto.randomUUID()}`;
  await f.db
    .update(user)
    .set({ name: "Alice renamed", image: humanImage })
    .where(eq(user.id, "alice"));
  const fileId = crypto.randomUUID();
  await f.db.insert(storedFiles).values({
    id: fileId,
    ownerUserId: "alice",
    uploadedBy: "alice",
    purpose: "avatar",
    filename: "agent.webp",
    contentType: "image/webp",
    size: 10,
    objectKey: `pictures/${fileId}`,
    sha256: "hash",
  });
  await f.db
    .update(userAgents)
    .set({ name: "Agent renamed", imageFileId: fileId })
    .where(eq(userAgents.id, agent.agentId));
  await f.db.insert(taskComments).values(
    [f.alice, agent.actorId].map((authorActorEntityId) => ({
      organizationId: f.orgA,
      taskEntityId: task.entityId,
      authorActorEntityId,
      body: "Comment",
    })),
  );
  const { db, queries, parameters } = recordQueries();
  const read = (actorEntityId: string, userId?: string) => {
    const scope =
      userId === undefined
        ? { organizationId: f.orgA, actorEntityId }
        : { organizationId: f.orgA, actorEntityId, userId };
    return queryTaskComments(new RepositoryContext(db, scope), task.entityId, "alice");
  };
  for (const viewer of [f.alice, agent.actorId, f.bob]) {
    const rows = await read(viewer);
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.author.id === f.alice)).toMatchObject({
      author: { name: "Alice renamed", kind: "owner" },
      authorImage: humanImage,
    });
    expect(rows.find((row) => row.author.id === agent.actorId)).toMatchObject({
      author: { name: "Agent renamed", kind: "agent" },
      authorImage: viewer === f.bob ? null : `/api/v1/files/${fileId}/content`,
    });
  }
  expect(queries).toHaveLength(3);
  const plan = await f.db.$client.unsafe(
    `explain (format json) ${queries[0]}`,
    // SAFETY: the logger records the same values Drizzle binds to this statement.
    parameters[0] as never[],
  );
  // The viewer lookup is an InitPlan. Author metadata must not have per-comment SubPlans.
  expect(JSON.stringify(plan)).not.toContain('"Parent Relationship":"SubPlan"');
  expect(
    (await read(agent.actorId, "alice")).find((row) => row.author.id === agent.actorId)
      ?.authorImage,
  ).toBe(`/api/v1/files/${fileId}/content`);
  expect(
    (await read(f.bob, "bob")).find((row) => row.author.id === agent.actorId)?.authorImage,
  ).toBeNull();
  await f.db.update(userAgents).set({ imageFileId: null }).where(eq(userAgents.id, agent.agentId));
  expect(
    (await read(f.alice)).find((row) => row.author.id === agent.actorId)?.authorImage,
  ).toBeNull();
  await f.db
    .update(user)
    .set({ image: "https://example.test/tracker.png" })
    .where(eq(user.id, "alice"));
  expect((await read(f.bob)).find((row) => row.author.id === f.alice)?.authorImage).toBeNull();
  await f.db.update(user).set({ image: humanImage }).where(eq(user.id, "alice"));
  await f.db.delete(member).where(eq(member.id, "alice-a"));
  expect((await read(f.bob)).find((row) => row.author.id === f.alice)).toMatchObject({
    author: { name: "Alice renamed" },
    authorImage: null,
  });
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
