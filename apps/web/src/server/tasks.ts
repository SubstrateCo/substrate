import { readProject, readProjects, readTaskComments, writeTasks } from "@startup-os/auth/tasks";
import {
  projectRequest,
  taskRequest,
  tasksWorkspace,
  tasksWrite,
} from "@startup-os/auth/tasks-contract";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders, setResponseHeader } from "@tanstack/react-start/server";

export const listProjects = createServerFn({ method: "GET" })
  .validator(tasksWorkspace)
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "no-store");
    return readProjects(getRequestHeaders(), data);
  });
export const getProject = createServerFn({ method: "GET" })
  .validator(projectRequest)
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "no-store");
    return readProject(getRequestHeaders(), data);
  });
export const listTaskComments = createServerFn({ method: "GET" })
  .validator(taskRequest)
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "no-store");
    return readTaskComments(getRequestHeaders(), data);
  });
export const mutateTasks = createServerFn({ method: "POST" })
  .validator(tasksWrite)
  .handler(async ({ data }) => writeTasks(getRequestHeaders(), data));
