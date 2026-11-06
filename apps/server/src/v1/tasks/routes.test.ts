import { expect, mock, test } from "bun:test";
import { failure, success } from "@startup-os/contracts/result";
import { createTasksRoutes } from "./routes";
import * as services from "./service";

const projectEntityId = "00000000-0000-4000-8000-000000000001";

test("task routes reject invalid requests before calling a service", async () => {
  const calls = mock(services.listProjects);
  const app = createTasksRoutes({ ...services, listProjects: calls });
  const response = await app.request("/projects");
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual(failure("INVALID_INPUT", "Invalid request input."));
  expect(calls).not.toHaveBeenCalled();

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
  expect(getProject).toHaveBeenCalledWith(expect.any(Headers), {
    organizationId: "org",
    projectEntityId,
  });
  expect(getProject.mock.calls[0]?.[0].get("cookie")).toBe("session=example");
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
  expect(mutateTasks).toHaveBeenCalledWith(expect.any(Headers), {
    organizationId: "org",
    action: "createProject",
    name: "Launch",
  });
});
