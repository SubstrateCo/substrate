import { AccessDeniedError, ValidationError } from "../../errors";
import { taskActivity } from "../../features/activity/schema";
import { createRepositories } from "../../repositories";
import { actors, entities, entityGrants, member, userAgents } from "../../schema";
import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { ensureUserAgentActor } from "./provisioning";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();
async function assistant() {
  const [agent] = await f.db
    .insert(userAgents)
    .values({
      userId: "alice",
      name: "Assistant",
      instructions: "Help",
      avatarCode: "100000",
      harness: "opencode",
    })
    .returning();
  const provisioned = await ensureUserAgentActor(f.db, {
    userId: "alice",
    userAgentId: agent!.id,
    organizationId: f.orgA,
  });
  const repositories = f.forActor(provisioned.entityId);
  const [actor] = await f.db.select().from(actors).where(eq(actors.userAgentId, agent!.id));
  return { repositories, actor: actor!, agent: agent! };
}

test("agents use their owner's live access, not grants of their own", async () => {
  await f.db.update(member).set({ role: "member" }).where(eq(member.userId, "alice"));
  const { repositories: agent, actor } = await assistant();
  const account = await f.forActor(f.bob).crm.createAccount({ name: "Shared" });
  expect(await rejection(agent.crm.getAccount(account.entityId))).toBeInstanceOf(AccessDeniedError);
  expect(
    await rejection(
      f.db
        .insert(entityGrants)
        .values({
          organizationId: f.orgA,
          entityId: account.entityId,
          actorEntityId: actor.entityId,
          level: "owner",
        })
        .execute(),
    ),
  ).toMatchObject({ cause: { code: "23503" } });
  for (const level of ["view", "comment", "edit", "owner"] as const) {
    await f
      .forActor(f.bob)
      .permissions.grant({ entityId: account.entityId, actorEntityId: f.alice, level });
    expect(await f.accessLevel(actor.entityId, account.entityId)).toBe(level);
    expect((await agent.crm.listAccounts()).map((item) => item.entityId)).toContain(
      account.entityId,
    );
    if (level === "view" || level === "comment") {
      expect(
        await rejection(agent.crm.updateAccount(account.entityId, { name: "Changed" })),
      ).toBeInstanceOf(AccessDeniedError);
    } else {
      expect((await agent.crm.updateAccount(account.entityId, { name: "Changed" })).name).toBe(
        "Changed",
      );
    }
  }
  await f
    .forActor(f.bob)
    .permissions.revoke({ entityId: account.entityId, actorEntityId: f.alice });
  expect(await agent.crm.listAccounts()).toEqual([]);
  expect(await rejection(agent.crm.getAccount(account.entityId))).toBeInstanceOf(AccessDeniedError);
});

test("agents cannot receive grants", async () => {
  const { actor } = await assistant();
  const account = await f.forActor(f.bob).crm.createAccount({ name: "Shared" });
  expect(
    await rejection(
      f.forActor(f.bob).permissions.grant({
        entityId: account.entityId,
        actorEntityId: actor.entityId,
        level: "view",
      }),
    ),
  ).toBeInstanceOf(ValidationError);
});

test("agent-created records belong to the owner and keep agent activity attribution", async () => {
  const { repositories: agent, actor } = await assistant();
  const project = await agent.projects.create({ name: "Agent work" });
  expect(await f.accessLevel(actor.entityId, project.entityId)).toBe("owner");
  expect((await f.forActor(f.alice).projects.get(project.entityId)).name).toBe("Agent work");
  const grants = await f.db
    .select()
    .from(entityGrants)
    .where(eq(entityGrants.entityId, project.entityId));
  expect(grants.map((grant) => grant.actorEntityId)).toEqual([f.alice]);
  const detail = await agent.projects.getDetail(project.entityId);
  expect(detail.members.map((item) => item.actorEntityId)).toEqual([f.alice]);
  expect(detail.actors).toContainEqual({
    entityId: actor.entityId,
    name: "Assistant",
    type: "agent",
    assignable: true,
    image: null,
    avatar: "100000",
  });
  const task = await agent.tasks.create({
    projectEntityId: project.entityId,
    title: "Assigned",
    assigneeActorEntityId: actor.entityId,
  });
  expect((await agent.tasks.get(task.entityId)).assigneeActorEntityId).toBe(actor.entityId);
  const [event] = await f.db
    .select()
    .from(taskActivity)
    .where(eq(taskActivity.taskEntityId, task.entityId));
  expect(event?.actorEntityId).toBe(actor.entityId);
});

test("other members cannot see or assign a user's local agent, but see it on assigned tasks", async () => {
  const { repositories: agent, actor } = await assistant();
  const alice = f.forActor(f.alice);
  const bob = f.forActor(f.bob);
  const project = await alice.projects.create({ name: "Shared" });
  await alice.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "edit",
  });
  expect(
    await rejection(
      bob.tasks.create({
        projectEntityId: project.entityId,
        title: "Not allowed",
        assigneeActorEntityId: actor.entityId,
      }),
    ),
  ).toBeInstanceOf(AccessDeniedError);
  const task = await bob.tasks.create({ projectEntityId: project.entityId, title: "Open" });
  expect(
    await rejection(bob.tasks.update(task.entityId, { assigneeActorEntityId: actor.entityId })),
  ).toBeInstanceOf(AccessDeniedError);
  expect(
    (await bob.projects.getDetail(project.entityId)).actors.map((item) => item.entityId),
  ).not.toContain(actor.entityId);
  for (const owner of [alice, agent])
    expect((await owner.projects.getDetail(project.entityId)).actors).toContainEqual({
      entityId: actor.entityId,
      name: "Assistant",
      type: "agent",
      assignable: true,
      image: null,
      avatar: "100000",
    });
  await alice.tasks.update(task.entityId, { assigneeActorEntityId: actor.entityId });
  expect(
    (
      await bob.tasks.update(task.entityId, {
        title: "Renamed",
        assigneeActorEntityId: actor.entityId,
      })
    ).title,
  ).toBe("Renamed");
  expect((await bob.projects.getDetail(project.entityId)).actors).toContainEqual({
    entityId: actor.entityId,
    name: "Assistant",
    type: "agent",
    assignable: false,
    image: null,
    avatar: "100000",
  });
});

test("the database rejects cross-organization grants to agents", async () => {
  const { actor } = await assistant();
  const project = await f.forActor(f.outsider, f.orgB).projects.create({ name: "Owned" });
  expect(
    await rejection(
      f.db
        .insert(entityGrants)
        .values({
          organizationId: f.orgB,
          entityId: project.entityId,
          actorEntityId: actor.entityId,
          level: "owner",
        })
        .execute(),
    ),
  ).toMatchObject({ cause: { code: "23503" } });
});

test("agents cannot cross workspaces or outlive the owner's active identity", async () => {
  const { repositories: agent, actor } = await assistant();
  const foreign = await f.forActor(f.outsider, f.orgB).contacts.create({ displayName: "Foreign" });
  expect(await rejection(agent.contacts.get(foreign.entityId))).toBeInstanceOf(AccessDeniedError);
  await f.db.update(actors).set({ disabledAt: new Date() }).where(eq(actors.entityId, f.alice));
  expect(await rejection(agent.contacts.create({ displayName: "Blocked" }))).toBeInstanceOf(
    AccessDeniedError,
  );
  await f.db.update(actors).set({ disabledAt: null }).where(eq(actors.entityId, f.alice));
  const session = () =>
    createRepositories(f.db).forSession({
      userId: "alice",
      organizationId: f.orgA,
      actorEntityId: actor.entityId,
    });
  await f.db.update(entities).set({ deletedAt: new Date() }).where(eq(entities.entityId, f.alice));
  expect(await rejection(session())).toBeInstanceOf(AccessDeniedError);
  await f.db.update(entities).set({ deletedAt: null }).where(eq(entities.entityId, f.alice));
  await f.db.delete(member).where(eq(member.id, "alice-a"));
  expect(await rejection(session())).toBeInstanceOf(AccessDeniedError);
});
