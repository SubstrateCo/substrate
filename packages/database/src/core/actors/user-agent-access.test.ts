import { AccessDeniedError, ValidationError } from "../../errors";
import { taskActivity } from "../../features/activity/schema";
import { createRepositories } from "../../repositories";
import { actors, entities, entityGrants, member, userAgents } from "../../schema";
import { setupDatabase } from "../../testing/database";
/* oxlint-disable typescript/await-thenable -- Bun's rejects matchers return promises at runtime. */
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
      harness: "opencode",
    })
    .returning();
  const repositories = await createRepositories(f.db).forUserAgent({
    userId: "alice",
    userAgentId: agent!.id,
    organizationId: f.orgA,
  });
  const [actor] = await f.db.select().from(actors).where(eq(actors.userAgentId, agent!.id));
  return { repositories, actor: actor!, agent: agent! };
}

test("agents use their owner's live permission levels, not independent grants", async () => {
  const { repositories: agent } = await assistant();
  const contact = await f.forActor(f.bob).contacts.create({ displayName: "Shared" });
  await expect(agent.contacts.get(contact.entityId)).rejects.toBeInstanceOf(AccessDeniedError);
  for (const level of ["view", "comment", "edit", "owner"] as const) {
    await f
      .forActor(f.bob)
      .permissions.grant({ entityId: contact.entityId, actorEntityId: f.alice, level });
    expect(await agent.permissions.getEffectiveLevel(contact.entityId)).toBe(level);
    expect((await agent.contacts.list()).map((item) => item.entityId)).toContain(contact.entityId);
    if (level === "view" || level === "comment") {
      await expect(
        agent.contacts.update(contact.entityId, { displayName: "Changed" }),
      ).rejects.toBeInstanceOf(AccessDeniedError);
    } else {
      expect(
        (await agent.contacts.update(contact.entityId, { displayName: "Changed" })).displayName,
      ).toBe("Changed");
    }
  }
  await f
    .forActor(f.bob)
    .permissions.revoke({ entityId: contact.entityId, actorEntityId: f.alice });
  expect(await agent.contacts.list()).toEqual([]);
  await expect(agent.contacts.get(contact.entityId)).rejects.toBeInstanceOf(AccessDeniedError);
});

test("agent-created records belong to the user and cannot receive agent grants", async () => {
  const { repositories: agent, actor } = await assistant();
  const project = await agent.projects.create({ name: "Agent work" });
  expect(await f.forActor(f.alice).permissions.getEffectiveLevel(project.entityId)).toBe("owner");
  const grants = await f.db
    .select()
    .from(entityGrants)
    .where(eq(entityGrants.entityId, project.entityId));
  expect(grants.map((grant) => grant.actorEntityId)).toEqual([f.alice]);
  await expect(
    f
      .forActor(f.alice)
      .permissions.grant({
        entityId: project.entityId,
        actorEntityId: actor.entityId,
        level: "view",
      }),
  ).rejects.toBeInstanceOf(ValidationError);
  expect(
    (await agent.projects.listMembers(project.entityId)).map((item) => item.actorEntityId),
  ).toEqual([f.alice]);
  expect(
    (await agent.projects.availableActors(project.entityId)).map((item) => item.entityId),
  ).toContain(actor.entityId);
  const task = await agent.tasks.create({
    projectEntityId: project.entityId,
    title: "Assigned",
    assigneeActorEntityId: actor.entityId,
  });
  expect((await f.forActor(f.alice).tasks.get(task.entityId)).assigneeActorEntityId).toBe(
    actor.entityId,
  );
  const [event] = await f.db
    .select()
    .from(taskActivity)
    .where(eq(taskActivity.taskEntityId, task.entityId));
  expect(event?.actorEntityId).toBe(actor.entityId);
});

test("the database rejects independent grants to agents", async () => {
  const { actor } = await assistant();
  const project = await f.forActor(f.alice).projects.create({ name: "Owned" });
  await expect(
    f.db
      .insert(entityGrants)
      .values({
        organizationId: f.orgA,
        entityId: project.entityId,
        actorEntityId: actor.entityId,
        level: "owner",
      })
      .execute(),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
});

test("agents cannot cross workspaces or outlive the owner's active identity", async () => {
  const { repositories: agent } = await assistant();
  const foreign = await f.forActor(f.outsider, f.orgB).contacts.create({ displayName: "Foreign" });
  await expect(agent.contacts.get(foreign.entityId)).rejects.toBeInstanceOf(AccessDeniedError);
  await f.db.update(actors).set({ disabledAt: new Date() }).where(eq(actors.entityId, f.alice));
  await expect(agent.contacts.create({ displayName: "Blocked" })).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
  await f.db.update(actors).set({ disabledAt: null }).where(eq(actors.entityId, f.alice));
  await f.db.update(entities).set({ deletedAt: new Date() }).where(eq(entities.entityId, f.alice));
  await expect(agent.contacts.list()).rejects.toBeInstanceOf(AccessDeniedError);
  await f.db.update(entities).set({ deletedAt: null }).where(eq(entities.entityId, f.alice));
  await f.db.delete(member).where(eq(member.id, "alice-a"));
  await expect(agent.contacts.list()).rejects.toBeInstanceOf(AccessDeniedError);
});
