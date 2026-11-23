import type {
  projectList,
  projectRequest,
  taskRequest,
  taskLocationRequest,
  tasksWorkspace,
  TasksWrite,
} from "@substrate/contracts/tasks/input";

import { api, type ApiInput } from "../client";
import { uploadPictureBytes } from "../files/pictures";
import { readResult } from "../result";
import type { z } from "zod";

export const listProjects = ({ data, signal }: ApiInput<z.input<typeof projectList>>) =>
  readResult(api.tasks.projects.$get({ query: data }, { init: { signal } }));
export const getHomeTasks = ({ data, signal }: ApiInput<z.input<typeof tasksWorkspace>>) =>
  readResult(api.tasks.home.$get({ query: data }, { init: { signal } }));
export const getProject = ({ data, signal }: ApiInput<z.input<typeof projectRequest>>) =>
  readResult(api.tasks.project.$get({ query: data }, { init: { signal } }));
export const getTaskLocation = ({ data, signal }: ApiInput<z.input<typeof taskLocationRequest>>) =>
  readResult(api.tasks["task-location"].$get({ query: data }, { init: { signal } }));
export const openTaskDiscussion = ({ data, signal }: ApiInput<z.input<typeof taskRequest>>) =>
  readResult(api.tasks.discussion.$post({ json: data }, { init: { signal } }));
export const mutateTasks = ({ data, signal }: ApiInput<TasksWrite>) =>
  readResult(api.tasks.mutations.$post({ json: data }, { init: { signal } }));

export const setProjectPicture = (
  organizationId: string,
  projectEntityId: string,
  image: string | null,
) => mutateTasks({ data: { action: "setProjectPicture", organizationId, projectEntityId, image } });

export async function uploadProjectPicture(
  organizationId: string,
  projectEntityId: string,
  file: File,
  signal?: AbortSignal,
  onCommit?: () => void,
) {
  const { url } = await uploadPictureBytes(
    file,
    "project-icon",
    signal,
    organizationId,
    projectEntityId,
  );
  signal?.throwIfAborted();
  onCommit?.();
  return setProjectPicture(organizationId, projectEntityId, url);
}
