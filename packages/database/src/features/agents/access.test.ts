import { ensureHumanActor, ensureUserAgentActor } from "../../core/actors/provisioning";
import { member } from "../../core/organizations/schema";
import { AccessDeniedError } from "../../errors";
import { setupDatabase } from "../../testing/database";
import { agentAccessRepository } from "./access";
import { createAgentRepository } from "./repository";
/* oxlint-disable typescript/await-thenable -- Bun's rejects matchers return promises at runtime. */
import { expect, test } from "bun:test";

const f = setupDatabase();
const makeAgent = () =>
  createAgentRepository(f.db, "alice").saveAgent({
    name: "Research",
    instructions: "",
    harness: "opencode",
    enabled: true,
  });
const access = (userId = "alice", actorEntityId = f.alice, organizationId = f.orgA) =>
  agentAccessRepository(f.db, userId, { organizationId, actorEntityId });

test("the same personal agent has separate project grants in each organization", async () => {
  await f.db
    .insert(member)
    .values({ id: "alice-b", userId: "alice", organizationId: f.orgB, role: "member" });
  const otherActor = await ensureHumanActor(f.db, {
    userId: "alice",
    organizationId: f.orgB,
    name: "Alice",
  });
  const agent = await makeAgent();
  const first = await f.forActor(f.alice).projects.create({ name: "First workspace" });
  const second = await f
    .forActor(otherActor.entityId, f.orgB)
    .projects.create({ name: "Second workspace" });
  const otherAccess = access("alice", otherActor.entityId, f.orgB);
  await access().change({ agentId: agent.id, projectEntityId: first.entityId, level: "view" });
  expect(await otherAccess.list(agent.id)).toEqual([
    { entityId: second.entityId, name: "Second workspace", level: null, canManage: true },
  ]);
  await otherAccess.change({ agentId: agent.id, projectEntityId: second.entityId, level: "edit" });
  await access().change({ agentId: agent.id, projectEntityId: first.entityId, level: null });
  expect((await otherAccess.list(agent.id))[0]?.level).toBe("edit");
});

test("agent project grants reuse record access, inherit to tasks, and can be revoked", async () => {
  const agent = await makeAgent();
  const project = await f.forActor(f.alice).projects.create({ name: "Launch" });
  const task = await f
    .forActor(f.alice)
    .tasks.create({ projectEntityId: project.entityId, title: "Research" });
  await access().change({ agentId: agent.id, projectEntityId: project.entityId, level: "view" });
  const actor = await ensureUserAgentActor(f.db, {
    userId: "alice",
    organizationId: f.orgA,
    userAgentId: agent.id,
  });
  expect(await f.forActor(actor.entityId).tasks.get(task.entityId)).toMatchObject({
    title: "Research",
  });
  expect(await access().list(agent.id)).toEqual([
    { entityId: project.entityId, name: "Launch", level: "view", canManage: true },
  ]);
  await access().change({ agentId: agent.id, projectEntityId: project.entityId, level: null });
  await expect(f.forActor(actor.entityId).tasks.get(task.entityId)).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
});

test("agent access does not expose hidden projects or let membership, views, or foreign agent ownership grant access", async () => {
  const agent = await makeAgent();
  const project = await f.forActor(f.bob).projects.create({ name: "Hidden" });
  const foreign = await f.forActor(f.outsider, f.orgB).projects.create({ name: "Other workspace" });
  expect(await access().list(agent.id)).toEqual([]);
  for (const projectEntityId of [project.entityId, foreign.entityId]) {
    await expect(
      access().change({ agentId: agent.id, projectEntityId, level: "edit" }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  }
  await f
    .forActor(f.bob)
    .permissions.grant({ entityId: project.entityId, actorEntityId: f.alice, level: "view" });
  await expect(
    access().change({ agentId: agent.id, projectEntityId: project.entityId, level: "view" }),
  ).rejects.toBeInstanceOf(AccessDeniedError);
  await expect(access("bob", f.bob).list(agent.id)).rejects.toBeInstanceOf(AccessDeniedError);
  await expect(
    access("outsider", f.outsider, f.orgB).change({
      agentId: agent.id,
      projectEntityId: foreign.entityId,
      level: "view",
    }),
  ).rejects.toBeInstanceOf(AccessDeniedError);
});
