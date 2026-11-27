import { entities } from "../../core/entities/schema";
import { member } from "../../core/organizations/schema";
import { AccessDeniedError } from "../../errors";
import { ActorRepositories } from "../../repositories";
import { user, userAgents } from "../../schema";
import { ownedAgent } from "../../testing/agents";
import { setupDatabase } from "../../testing/database";
import { recordQueries } from "../../testing/queries";
import { rejection } from "../../testing/rejection";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";

const f = setupDatabase();

test("project tasks expose only their own existing discussion without creating one", async () => {
  const alice = f.forActor(f.alice);
  const project = await alice.projects.create({ name: "Discussions" });
  const first = await alice.tasks.create({ projectEntityId: project.entityId, title: "First" });
  const second = await alice.tasks.create({ projectEntityId: project.entityId, title: "Second" });
  const discussionId = await alice.tasks.ensureDiscussion(first.entityId);
  const detail = await alice.projects.getDetail(project.entityId);
  expect(
    detail.tasks.find((task) => task.entityId === first.entityId)?.discussionConversationId,
  ).toBe(discussionId);
  expect(
    detail.tasks.find((task) => task.entityId === second.entityId)?.discussionConversationId,
  ).toBeNull();
});

test("project members and available actors join current names, pictures and agent avatars", async () => {
  const agent = await ownedAgent(f);
  const alice = f.forActor(f.alice);
  const project = await alice.projects.create({ name: "Actor metadata" });
  await alice.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  await alice.tasks.create({
    projectEntityId: project.entityId,
    title: "Assigned agent",
    assigneeActorEntityId: agent.actorId,
  });
  const image = `/api/v1/files/pictures/avatar/alice?v=${crypto.randomUUID()}`;
  await f.db.update(user).set({ name: "Zoe", image }).where(eq(user.id, "alice"));
  await f.db
    .update(userAgents)
    .set({ name: "Amy", avatarCode: "131005" })
    .where(eq(userAgents.id, agent.agentId));
  const { db, queries } = recordQueries();
  for (const viewer of [f.alice, f.bob, agent.actorId]) {
    const repos = new ActorRepositories(db, { organizationId: f.orgA, actorEntityId: viewer });
    const result = await repos.projects.getDetail(project.entityId);
    expect(result.members.map((row) => row.name)).toEqual(["Bob", "Zoe"]);
    expect(result.actors.map((row) => row.name)).toEqual(["Amy", "Bob", "Zoe"]);
    for (const rows of [result.members, result.actors]) {
      expect(rows.find((row) => row.name === "Zoe")?.image).toBe(image);
    }
    expect(result.actors.find((row) => row.name === "Amy")).toMatchObject({
      image: null,
      avatar: "131005",
    });
    expect(result.actors.find((row) => row.name === "Zoe")?.avatar).toBeNull();
    expect(result.actors.find((row) => row.entityId === agent.actorId)?.assignable).toBe(
      viewer !== f.bob,
    );
  }
  const metadataQueries = queries.filter(
    (query) => query.includes('left join "user"') && query.includes('left join "member"'),
  );
  expect(metadataQueries).toHaveLength(3);
  for (const query of metadataQueries) {
    expect(query).not.toMatch(
      /select\s+(?:dn_user|dn_agent|picture_user|picture_agent|picture_member)\./i,
    );
  }
  await f.db
    .update(user)
    .set({ image: "https://example.test/tracker.png" })
    .where(eq(user.id, "alice"));
  const result = await f.forActor(f.bob).projects.getDetail(project.entityId);
  expect(result.members.find((row) => row.actorEntityId === f.alice)?.image).toBeNull();
  expect(result.actors.find((row) => row.entityId === f.alice)?.image).toBeNull();
});

test("only actors who can read the project are assignable, like the assignee check", async () => {
  const alice = f.forActor(f.alice);
  const project = await alice.projects.create({ name: "Assignable" });
  const assignable = async () =>
    Object.fromEntries(
      (await alice.projects.getDetail(project.entityId)).actors.map((row) => [
        row.entityId,
        row.assignable,
      ]),
    );
  // Bob is a member without a grant, so the server refuses him as an assignee.
  expect((await assignable())[f.bob]).toBe(false);
  expect(
    await rejection(
      alice.tasks.create({
        projectEntityId: project.entityId,
        title: "Refused",
        assigneeActorEntityId: f.bob,
      }),
    ),
  ).toBeInstanceOf(AccessDeniedError);
  // An organization admin reaches the project through the role, without a grant.
  await f.db.update(member).set({ role: "admin" }).where(eq(member.id, "bob-a"));
  expect((await assignable())[f.bob]).toBe(true);
  await alice.tasks.create({
    projectEntityId: project.entityId,
    title: "Accepted",
    assigneeActorEntityId: f.bob,
  });
});

test("project detail preserves protected output in one SELECT statement", async () => {
  const alice = f.forActor(f.alice);
  const project = await alice.projects.create({ name: "Detail" });
  const visible = await alice.tasks.create({
    projectEntityId: project.entityId,
    title: "Visible",
    priority: "high",
    assigneeActorEntityId: f.alice,
    dueDate: "2026-12-01",
  });
  const child = await alice.tasks.create({
    projectEntityId: project.entityId,
    parentTaskEntityId: visible.entityId,
    title: "Child",
  });
  const other = await alice.projects.create({ name: "Other" });
  await alice.tasks.create({ projectEntityId: other.entityId, title: "Other project" });
  const deleted = await alice.tasks.create({ projectEntityId: project.entityId, title: "Deleted" });
  await f.db
    .update(entities)
    .set({ deletedAt: new Date() })
    .where(eq(entities.entityId, deleted.entityId));
  const statements: string[] = [];
  const db = drizzle(f.db.$client, {
    logger: { logQuery: (query) => statements.push(query) },
  });
  const repos = new ActorRepositories(db, { organizationId: f.orgA, actorEntityId: f.alice });
  const { result: actual } = await repos.transaction((tx) =>
    tx.projects.getDetail(project.entityId),
  );
  expect(statements.filter((query) => /^(select|with)\b/i.test(query.trimStart()))).toHaveLength(1);
  expect(actual.project).toEqual(await alice.projects.get(project.entityId));
  expect(actual.level).toBe("owner");
  expect(actual.tasks.map((task) => task.entityId)).toEqual(
    [visible.entityId, child.entityId].sort(),
  );
  expect(actual.tasks.find((task) => task.entityId === visible.entityId)).toEqual({
    entityId: visible.entityId,
    projectEntityId: project.entityId,
    parentTaskEntityId: null,
    title: "Visible",
    description: "",
    status: visible.status,
    priority: "high",
    assigneeActorEntityId: f.alice,
    dueDate: "2026-12-01",
    discussionConversationId: null,
  });
  expect(actual.actors.map((actor) => actor.entityId)).toEqual([f.alice, f.bob]);
  expect(actual.members).toEqual([
    {
      actorEntityId: f.alice,
      name: "Alice",
      image: null,
      avatar: null,
      type: "human",
      level: "owner",
    },
  ]);
});

test("project and task getters authorize and read in one statement", async () => {
  const alice = f.forActor(f.alice);
  const project = await alice.projects.create({ name: "One read" });
  const task = await alice.tasks.create({ projectEntityId: project.entityId, title: "One read" });
  const { db, queries } = recordQueries();
  const repos = new ActorRepositories(db, { organizationId: f.orgA, actorEntityId: f.alice });
  expect(await repos.projects.get(project.entityId)).toEqual(project);
  expect(queries).toHaveLength(1);
  queries.length = 0;
  expect<typeof task>(await repos.tasks.get(task.entityId)).toEqual(task);
  expect(queries).toHaveLength(1);
});

test("single-statement getters retain minimum levels", async () => {
  const alice = f.forActor(f.alice);
  const bob = f.forActor(f.bob);
  const project = await alice.projects.create({ name: "Read access" });
  const task = await alice.tasks.create({
    projectEntityId: project.entityId,
    title: "Read access",
  });
  await alice.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "comment",
  });
  expect<typeof task>(await bob.tasks.get(task.entityId, "comment")).toEqual(task);
  expect(await rejection(bob.tasks.get(task.entityId, "edit"))).toBeInstanceOf(AccessDeniedError);
  expect(await bob.projects.get(project.entityId)).toEqual(project);
});

test("project detail denies revoked, deleted and foreign access", async () => {
  const alice = f.forActor(f.alice);
  const bob = f.forActor(f.bob);
  const project = await alice.projects.create({ name: "Private" });
  const task = await alice.tasks.create({
    projectEntityId: project.entityId,
    title: "Private task",
  });
  expect(await rejection(bob.projects.getDetail(project.entityId))).toBeInstanceOf(
    AccessDeniedError,
  );
  await alice.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  expect((await bob.projects.getDetail(project.entityId)).level).toBe("view");
  await alice.permissions.revoke({ entityId: project.entityId, actorEntityId: f.bob });
  expect(await rejection(bob.tasks.get(task.entityId))).toBeInstanceOf(AccessDeniedError);
  expect(await rejection(bob.projects.getDetail(project.entityId))).toBeInstanceOf(
    AccessDeniedError,
  );
  for (const read of [
    () => bob.projects.get(project.entityId),
    () => bob.tasks.list(project.entityId),
  ]) {
    expect(await rejection(read())).toBeInstanceOf(AccessDeniedError);
  }
  expect(
    await rejection(f.forActor(f.outsider, f.orgB).projects.getDetail(project.entityId)),
  ).toBeInstanceOf(AccessDeniedError);
  await f.db
    .update(entities)
    .set({ deletedAt: new Date() })
    .where(eq(entities.entityId, project.entityId));
  expect(await rejection(alice.projects.getDetail(project.entityId))).toBeInstanceOf(
    AccessDeniedError,
  );
});
