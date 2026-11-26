import { AccessDeniedError, ValidationError } from "../../../../../packages/database/src/errors";
import { member, taskActivity } from "../../../../../packages/database/src/schema";
import { dmTurn } from "../../../../../packages/database/src/testing/agent-work";
import { setupDatabase } from "../../../../../packages/database/src/testing/database";
import { rejection } from "../../../../../packages/database/src/testing/rejection";
import { agentWorkFixture } from "./test-support";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { ZodError } from "zod";

const f = setupDatabase();

async function tools() {
  const fixture = await agentWorkFixture(f);
  const turn = dmTurn(fixture.dm.id);
  const call = <K extends Parameters<typeof fixture.call>[0]>(
    tool: K,
    input: Parameters<typeof fixture.call>[1],
  ) => fixture.call(tool, input, turn);
  return { ...fixture, call };
}

test("create_project and update_project write as the agent and replay their result", async () => {
  const { call } = await tools();
  const input = { requestId: crypto.randomUUID(), name: "Launch", description: "Q3" };
  const created = await call("create_project", input);
  expect(created).toMatchObject({
    name: "Launch",
    description: "Q3",
    archived: false,
    // The agent creates with its owner's access, so the owner owns the project.
    yourLevel: "owner",
    members: [{ actor: { id: f.alice, type: "human" }, level: "owner" }],
  });
  expect(await call("create_project", input)).toEqual(created);

  // Only the supplied field changes.
  const renamed = await call("update_project", {
    requestId: crypto.randomUUID(),
    projectId: created.id,
    changes: { name: "Launch v2" },
  });
  expect(renamed).toMatchObject({ name: "Launch v2", description: "Q3" });
  expect(
    await rejection(
      call("update_project", {
        requestId: crypto.randomUUID(),
        projectId: created.id,
        changes: {},
      }),
    ),
  ).toBeInstanceOf(ZodError);
});

test("project reads show the archived state, the caller's level and direct members", async () => {
  const { call } = await tools();
  await f.db.update(member).set({ role: "member" }).where(eq(member.userId, "alice"));
  const bob = f.forActor(f.bob);
  const shared = await bob.projects.create({ name: "Bob's" });
  await bob.permissions.grant({ entityId: shared.entityId, actorEntityId: f.alice, level: "view" });
  const archived = await f.forActor(f.alice).projects.create({ name: "Old" });
  await f.forActor(f.alice).projects.archive(archived.entityId);

  expect(await call("get_project", { projectId: shared.entityId })).toMatchObject({
    archived: false,
    yourLevel: "view",
    members: expect.arrayContaining([
      { actor: { id: f.alice, name: expect.any(String), type: "human" }, level: "view" },
      { actor: { id: f.bob, name: expect.any(String), type: "human" }, level: "owner" },
    ]),
  });
  const names = async (filter?: string) =>
    (await call("list_projects", filter ? { archived: filter } : {})).items.map((item) => [
      item.name,
      item.archived,
    ]);
  expect(await names()).toEqual([["Bob's", false]]);
  expect(await names("archived")).toEqual([["Old", true]]);
  expect(await names("all")).toEqual([
    ["Bob's", false],
    ["Old", true],
  ]);
  expect(await call("get_project", { projectId: archived.entityId })).toMatchObject({
    archived: true,
  });
  // An archived project takes no changes, and view access takes none either.
  for (const projectId of [archived.entityId, shared.entityId])
    expect(
      await rejection(
        call("update_project", {
          requestId: crypto.randomUUID(),
          projectId,
          changes: { name: "X" },
        }),
      ),
    ).toBeInstanceOf(projectId === archived.entityId ? ValidationError : AccessDeniedError);
});

test("move_task moves a task with its subtasks to another project and under a new parent", async () => {
  const { agent, call } = await tools();
  const repos = f.forActor(f.alice);
  const from = await repos.projects.create({ name: "From" });
  const to = await repos.projects.create({ name: "To" });
  const task = await repos.tasks.create({ projectEntityId: from.entityId, title: "Move me" });
  const subtask = await repos.tasks.create({
    projectEntityId: from.entityId,
    parentTaskEntityId: task.entityId,
    title: "Comes along",
  });
  const parent = await repos.tasks.create({ projectEntityId: to.entityId, title: "New parent" });

  const moved = await call("move_task", {
    requestId: crypto.randomUUID(),
    taskId: task.entityId,
    projectId: to.entityId,
    parentTaskId: parent.entityId,
  });
  expect(moved).toMatchObject({
    project: { id: to.entityId, name: "To" },
    parent: { id: parent.entityId },
    subtaskCount: 1,
  });
  expect((await call("get_task", { taskId: subtask.entityId })).project.id).toBe(to.entityId);
  const moves = await f.db
    .select()
    .from(taskActivity)
    .where(eq(taskActivity.taskEntityId, task.entityId));
  expect(moves.find((row) => row.action === "Project changed")?.actorEntityId).toBe(agent.actorId);

  // A task cannot move under its own subtask, and back to the top level it has no parent.
  expect(
    await rejection(
      call("move_task", {
        requestId: crypto.randomUUID(),
        taskId: task.entityId,
        projectId: to.entityId,
        parentTaskId: subtask.entityId,
      }),
    ),
  ).toBeInstanceOf(ValidationError);
  const top = await call("move_task", {
    requestId: crypto.randomUUID(),
    taskId: task.entityId,
    projectId: to.entityId,
    parentTaskId: null,
  });
  expect(top).toMatchObject({ project: { id: to.entityId }, parent: null });
});

test("move_task needs edit access on the destination and an active destination", async () => {
  const { call } = await tools();
  await f.db.update(member).set({ role: "member" }).where(eq(member.userId, "alice"));
  const repos = f.forActor(f.alice);
  const own = await repos.projects.create({ name: "Mine" });
  const task = await repos.tasks.create({ projectEntityId: own.entityId, title: "Task" });
  const bob = f.forActor(f.bob);
  const readOnly = await bob.projects.create({ name: "Bob's" });
  await bob.permissions.grant({
    entityId: readOnly.entityId,
    actorEntityId: f.alice,
    level: "view",
  });
  const archived = await repos.projects.create({ name: "Old" });
  await repos.projects.archive(archived.entityId);

  const move = (projectId: string) =>
    rejection(
      call("move_task", {
        requestId: crypto.randomUUID(),
        taskId: task.entityId,
        projectId,
        parentTaskId: null,
      }),
    );
  expect(await move(readOnly.entityId)).toBeInstanceOf(AccessDeniedError);
  expect(await move(archived.entityId)).toBeInstanceOf(ValidationError);
  expect((await call("get_task", { taskId: task.entityId })).project.id).toBe(own.entityId);
});
