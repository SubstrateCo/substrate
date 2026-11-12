import { failure, publicFailure, success } from "@substrate/contracts/result";
import type { TasksWrite } from "@substrate/contracts/tasks/input";

import { createTestScopes, createTestServices } from "../../test-support";
import { createTasksRoutes as createRoutes } from "./routes";
import type { TasksService } from "./service";
import { expect, mock, test } from "bun:test";

const services = createTestServices().tasks;
const createTasksRoutes = (service: TasksService) => createRoutes(service, createTestScopes());

const projectEntityId = "00000000-0000-4000-8000-000000000001";

test("discussion resolution validates the task and preserves workspace scope", async () => {
  const ensureDiscussion = mock(async () => success({ conversationId: projectEntityId }));
  const app = createTasksRoutes({ ...services, ensureDiscussion });
  const resolve = (taskEntityId: string) =>
    app.request("/discussion", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ organizationId: "org", projectEntityId, taskEntityId }),
    });
  expect((await resolve("invalid")).status).toBe(400);
  expect(ensureDiscussion).not.toHaveBeenCalled();
  const response = await resolve(projectEntityId);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(success({ conversationId: projectEntityId }));
  expect(ensureDiscussion).toHaveBeenCalledWith(
    expect.objectContaining({ userId: "user-1", organizationId: "org" }),
    { organizationId: "org", projectEntityId, taskEntityId: projectEntityId },
  );
});

test("task routes reject invalid requests before calling a service", async () => {
  const reads = {
    listProjects: mock(services.listProjects),
    getProject: mock(services.getProject),
  };
  const app = createTasksRoutes({ ...services, ...reads });
  for (const path of ["/projects", "/project?organizationId=org&projectEntityId=invalid"]) {
    const response = await app.request(path);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(publicFailure("INVALID_INPUT", "Invalid request input."));
  }
  for (const read of Object.values(reads)) expect(read).not.toHaveBeenCalled();

  const mutateTasks = mock(services.mutateTasks);
  const mutations = createTasksRoutes({ ...services, mutateTasks });
  for (const change of [
    { projectEntityId: undefined },
    { title: " " },
    { dueDate: "2026-02-31" },
    { priority: "highest" },
  ]) {
    const result = await mutations.request("/mutations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        organizationId: "org",
        projectEntityId,
        action: "createTask",
        title: "Ship",
        ...change,
      }),
    });
    expect(result.status).toBe(400);
  }
  expect(mutateTasks).not.toHaveBeenCalled();
});

test("removed comment mutations are rejected instead of succeeding without a message", async () => {
  const mutateTasks = mock(services.mutateTasks);
  const app = createTasksRoutes({ ...services, mutateTasks });
  const response = await app.request("/mutations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      organizationId: "org",
      projectEntityId,
      taskEntityId: projectEntityId,
      action: "comment",
      body: "Use the shared discussion",
    }),
  });
  expect(response.status).toBe(400);
  expect(mutateTasks).not.toHaveBeenCalled();
});

test("task routes preserve service errors and request scope", async () => {
  const getProject = mock<typeof services.getProject>(async () =>
    failure("NOT_FOUND", "Item not found or access denied."),
  );
  const app = createTasksRoutes({ ...services, getProject });
  const response = await app.request(
    `/project?organizationId=org&projectEntityId=${projectEntityId}`,
    {
      headers: { cookie: "session=example" },
    },
  );
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual(failure("NOT_FOUND", "Item not found or access denied."));
  expect(getProject).toHaveBeenCalledWith(
    expect.objectContaining({ userId: "user-1", organizationId: "org" }),
    {
      organizationId: "org",
      projectEntityId,
    },
  );
  expect(getProject.mock.calls[0]?.[0].session.user.id).toBe("user-1");
});

test("task mutations return successful IDs", async () => {
  const mutateTasks = mock(async () => success({ id: projectEntityId }));
  const app = createTasksRoutes({ ...services, mutateTasks });
  const response = await app.request("/mutations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ organizationId: "org", action: "createProject", name: " Launch " }),
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(success({ id: projectEntityId }));
  expect(mutateTasks).toHaveBeenCalledWith(
    expect.objectContaining({ userId: "user-1", organizationId: "org" }),
    {
      organizationId: "org",
      action: "createProject",
      name: "Launch",
    },
  );
});

test("task updates accept a single field and reject an empty patch", async () => {
  const mutateTasks = mock<typeof services.mutateTasks>(async () =>
    success({ id: projectEntityId }),
  );
  const app = createTasksRoutes({ ...services, mutateTasks });
  const input = {
    organizationId: "org",
    projectEntityId,
    taskEntityId: projectEntityId,
    action: "updateTask" as const,
  };
  const update = (fields: Partial<Extract<TasksWrite, { action: "updateTask" }>>) =>
    app.request("/mutations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...input, ...fields }),
    });
  expect((await update({ status: "completed" })).status).toBe(200);
  expect((await update({})).status).toBe(400);
  expect(mutateTasks.mock.calls).toHaveLength(1);
  expect(mutateTasks.mock.calls[0]?.[1]).toEqual({ ...input, status: "completed" });
});
