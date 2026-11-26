import { staleProposalError } from "@substrate/contracts/agent-work";
import type { WorkspaceApiRequest } from "@substrate/contracts/harness/mcp";
import type { ServerToolName } from "@substrate/contracts/harness/tools";

import { ValidationError } from "../../../errors";
import { entities, entityGrants, member, projects } from "../../../schema";
import { agentWorkFixture, dmTurn, ownerAgentWork } from "../../../testing/agent-work";
import { setupDatabase } from "../../../testing/database";
import { rejection } from "../../../testing/rejection";
import { expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";

const f = setupDatabase();

async function proposals() {
  const fixture = await agentWorkFixture(f);
  const turn = dmTurn(fixture.dm.id);
  const propose = (tool: ServerToolName, input: WorkspaceApiRequest["input"]) =>
    fixture.propose(tool, { requestId: crypto.randomUUID(), ...input }, turn);
  const work = await ownerAgentWork(f.db, fixture.owner);
  const approve = async (tool: ServerToolName, input: WorkspaceApiRequest["input"]) =>
    (await work.approveProposal(await propose(tool, input))).result.outcome;
  return { ...fixture, propose, approve, work };
}

const deletedAt = async (entityId: string) =>
  (
    await f.db
      .select({ deletedAt: entities.deletedAt })
      .from(entities)
      .where(eq(entities.entityId, entityId))
  )[0]!.deletedAt;

const archivedAt = async (entityId: string) =>
  (
    await f.db
      .select({ archivedAt: projects.archivedAt })
      .from(projects)
      .where(eq(projects.entityId, entityId))
  )[0]!.archivedAt;

const grant = async (entityId: string, actorEntityId: string) =>
  (
    await f.db
      .select({ level: entityGrants.level })
      .from(entityGrants)
      .where(
        and(eq(entityGrants.entityId, entityId), eq(entityGrants.actorEntityId, actorEntityId)),
      )
  )[0]?.level;

test("an approved task deletion removes the task with its subtasks and names what it deleted", async () => {
  const { approve } = await proposals();
  const repos = f.forActor(f.alice);
  const project = await repos.projects.create({ name: "Work" });
  const task = await repos.tasks.create({ projectEntityId: project.entityId, title: "Parent" });
  const subtask = await repos.tasks.create({
    projectEntityId: project.entityId,
    parentTaskEntityId: task.entityId,
    title: "Child",
  });
  expect(await approve("delete_task", { taskId: task.entityId })).toMatchObject({
    status: "executed",
    receipt: { kind: "deleted", entityType: "task", id: task.entityId },
  });
  expect(await deletedAt(task.entityId)).not.toBeNull();
  expect(await deletedAt(subtask.entityId)).not.toBeNull();
});

test("a project is archived, restored, archived again and deleted through approvals", async () => {
  const { approve, propose } = await proposals();
  const project = await f.forActor(f.alice).projects.create({ name: "Work" });
  const input = { projectId: project.entityId };
  const receipt = {
    status: "executed",
    receipt: { kind: "project", id: project.entityId },
  } as const;
  // Deleting an active project could never run, so it is refused when proposed.
  expect(await rejection(propose("delete_project", input))).toBeInstanceOf(ValidationError);
  expect(await approve("archive_project", input)).toMatchObject(receipt);
  expect(await archivedAt(project.entityId)).not.toBeNull();
  expect(await approve("restore_project", input)).toMatchObject(receipt);
  expect(await archivedAt(project.entityId)).toBeNull();
  await approve("archive_project", input);
  expect(await approve("delete_project", input)).toMatchObject({
    status: "executed",
    receipt: { kind: "deleted", entityType: "project", id: project.entityId },
  });
  expect(await deletedAt(project.entityId)).not.toBeNull();
});

test("sharing grants and revokes a person's access, and an agent share fails on approval", async () => {
  const { agent, approve } = await proposals();
  const project = await f.forActor(f.alice).projects.create({ name: "Work" });
  const share = { projectId: project.entityId, actorId: f.bob, level: "edit" };
  expect(await approve("share_project", share)).toMatchObject({
    status: "executed",
    receipt: { kind: "project", id: project.entityId },
  });
  expect(await grant(project.entityId, f.bob)).toBe("edit");
  await approve("revoke_project_access", { projectId: project.entityId, actorId: f.bob });
  expect(await grant(project.entityId, f.bob)).toBeUndefined();
  expect(await approve("share_project", { ...share, actorId: agent.actorId })).toMatchObject({
    status: "failed",
  });
  expect(await grant(project.entityId, agent.actorId)).toBeUndefined();
});

test("an owner action approved with only edit access fails and changes nothing", async () => {
  const { approve } = await proposals();
  // Without the admin role, Alice has only the edit access Bob grants her.
  await f.db.update(member).set({ role: "member" }).where(eq(member.userId, "alice"));
  const project = await f.forActor(f.bob).projects.create({ name: "Bob's" });
  await f.forActor(f.bob).permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.alice,
    level: "edit",
  });
  expect(await approve("archive_project", { projectId: project.entityId })).toMatchObject({
    status: "failed",
  });
  expect(await archivedAt(project.entityId)).toBeNull();
});

test("an approval fails when the project changed after it was proposed", async () => {
  const { propose, work } = await proposals();
  const repos = f.forActor(f.alice);
  const project = await repos.projects.create({ name: "Work" });
  const proposalId = await propose("archive_project", { projectId: project.entityId });
  await repos.projects.update(project.entityId, { name: "Renamed", description: "" });
  expect((await work.approveProposal(proposalId)).result.outcome).toEqual({
    status: "failed",
    error: staleProposalError,
  });
  expect(await archivedAt(project.entityId)).toBeNull();
});
