import type {
  projectRequest,
  taskRequest,
  tasksWorkspace,
  TasksWrite,
} from "@startup-os/contracts/tasks/input";

import { api, type ApiInput } from "./client";
import { readResult } from "./result";
import type { z } from "zod";

export const listProjects = ({ data, signal }: ApiInput<z.input<typeof tasksWorkspace>>) =>
  readResult(api.tasks.projects.$get({ query: data }, { init: { signal } }));
export const getProject = ({ data, signal }: ApiInput<z.input<typeof projectRequest>>) =>
  readResult(api.tasks.project.$get({ query: data }, { init: { signal } }));
export const listTaskComments = ({ data, signal }: ApiInput<z.input<typeof taskRequest>>) =>
  readResult(api.tasks.comments.$get({ query: data }, { init: { signal } }));
export const mutateTasks = ({ data, signal }: ApiInput<TasksWrite>) =>
  readResult(api.tasks.mutations.$post({ json: data }, { init: { signal } }));
