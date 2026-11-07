import type { TasksWrite } from "@startup-os/contracts/tasks/input";

import type { QueryClient } from "@tanstack/react-query";

import { invalidateWorkLabels, staleSearches } from "../context/mutations";
import { queryKeys } from "../keys";
import type { getProject } from "@/api/tasks/requests";

export function invalidateTasksWrite(client: QueryClient, input: TasksWrite, id: string) {
  const organizationId = input.organizationId;
  const context = queryKeys.context(organizationId);
  if (input.action === "comment")
    return client.invalidateQueries({
      queryKey: queryKeys.taskComments(organizationId, input.projectEntityId, id),
    });
  const projectId = "projectEntityId" in input ? input.projectEntityId : id;
  const access = input.action === "share" || input.action === "revoke";
  const detail = client.getQueryData<Awaited<ReturnType<typeof getProject>>>(
    queryKeys.project(organizationId, projectId),
  );
  const entityIds = access
    ? [projectId, ...(detail?.tasks.map((task) => task.entityId) ?? [])]
    : [id];
  const refreshes = [
    client.invalidateQueries({ queryKey: queryKeys.project(organizationId, projectId) }),
    staleSearches(client, organizationId),
  ];
  if (input.action === "createProject" || input.action === "updateProject" || access)
    refreshes.push(client.invalidateQueries({ queryKey: queryKeys.projects(organizationId) }));
  if (input.action === "createTask" || input.action === "updateTask")
    refreshes.push(client.invalidateQueries({ queryKey: [...context, "activity", id] }));
  if (input.action === "updateTask" || input.action === "updateProject" || access)
    refreshes.push(invalidateWorkLabels(client, organizationId, entityIds));
  if (input.action !== "createProject")
    refreshes.push(
      client.invalidateQueries({ queryKey: [...context, "notifications"], exact: true }),
    );
  if (access)
    refreshes.push(
      client.invalidateQueries({
        queryKey: [...queryKeys.tasks(organizationId), "comments", projectId],
      }),
      client.invalidateQueries({
        queryKey: context,
        predicate: ({ queryKey }) =>
          (queryKey[3] === "related" || queryKey[3] === "activity") &&
          entityIds.some((entityId) => entityId === queryKey[4]),
      }),
    );
  return Promise.all(refreshes);
}
