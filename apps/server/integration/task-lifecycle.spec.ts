import type { TasksWrite } from "@substrate/contracts/tasks/input";

import { appOrigin } from "./test-support/environment";
import { rejected, result } from "./test-support/files";
import { test, type Actor } from "./test-support/fixtures";
import { expect } from "@playwright/test";

type Write<T = TasksWrite> = T extends TasksWrite ? Omit<T, "organizationId"> : never;
const write = (actor: Actor, data: Write, origin = appOrigin) =>
  actor.request.post("/api/v1/tasks/mutations", {
    headers: { origin },
    data: { ...data, organizationId: actor.organizationId },
  });
const create = async (actor: Actor, data: Write) =>
  (await result<{ id: string }>(await write(actor, data))).id;

test("deletion, partial updates, moves, and task-location reads enforce live access and trusted origins", async ({
  actors,
  workspace,
  playwright,
}) => {
  const [owner, member] = await workspace(actors.owner, actors.member);
  const source = await create(owner, { action: "createProject", name: "Source" });
  const destination = await create(owner, { action: "createProject", name: "Destination" });
  const task = await create(owner, {
    action: "createTask",
    projectEntityId: source,
    title: "Original title",
  });
  const projectResponse = await owner.request.get("/api/v1/tasks/project", {
    params: { organizationId: owner.organizationId, projectEntityId: source },
  });
  const project = await result<{ actors: { entityId: string; name: string }[] }>(projectResponse);
  const memberId = project.actors.find((actor) => actor.name === member.name)!.entityId;
  await result(
    await write(owner, {
      action: "share",
      projectEntityId: source,
      actorEntityId: memberId,
      level: "view",
    }),
  );
  const remove = { action: "deleteTask" as const, projectEntityId: source, taskEntityId: task };
  const move = {
    action: "moveTask" as const,
    projectEntityId: source,
    taskEntityId: task,
    destinationProjectEntityId: destination,
    parentTaskEntityId: null,
  };
  const patch = {
    action: "updateTask" as const,
    projectEntityId: source,
    taskEntityId: task,
    status: "completed" as const,
  };
  for (const input of [
    remove,
    move,
    patch,
    { action: "deleteProject" as const, projectEntityId: source },
  ]) {
    await rejected(await write(member, input));
    await rejected(await write(actors.outsider, input));
    expect((await write(owner, input, "https://untrusted.example.test")).status()).toBe(403);
  }
  await result(await write(owner, patch));
  await result(
    await write(owner, {
      action: "share",
      projectEntityId: source,
      actorEntityId: memberId,
      level: "edit",
    }),
  );
  await rejected(await write(member, move));
  // An editor can delete tasks but cannot delete the project.
  const disposable = await create(owner, {
    action: "createTask",
    projectEntityId: source,
    title: "Disposable",
  });
  await result(await write(member, { ...remove, taskEntityId: disposable }));
  await rejected(await write(member, { action: "deleteProject", projectEntityId: source }));
  await result(await write(owner, move));
  const params = { organizationId: owner.organizationId, taskEntityId: task };
  expect(await result(await owner.request.get("/api/v1/tasks/task-location", { params }))).toEqual({
    projectEntityId: destination,
  });
  await rejected(await member.request.get("/api/v1/tasks/task-location", { params }));
  const anonymous = await playwright.request.newContext({ baseURL: appOrigin });
  try {
    await rejected(await anonymous.get("/api/v1/tasks/task-location", { params }));
  } finally {
    await anonymous.dispose();
  }
  const moved = await result<{ tasks: { entityId: string; title: string; status: string }[] }>(
    await owner.request.get("/api/v1/tasks/project", {
      params: { organizationId: owner.organizationId, projectEntityId: destination },
    }),
  );
  expect(moved.tasks.find((item) => item.entityId === task)).toMatchObject({
    title: "Original title",
    status: "completed",
  });
  await result(await write(owner, { action: "deleteProject", projectEntityId: destination }));
  await rejected(await owner.request.get("/api/v1/tasks/task-location", { params }));
});
