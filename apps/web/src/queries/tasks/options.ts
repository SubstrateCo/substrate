import { queryOptions } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { getProject, listProjects, listTaskComments } from "@/api/tasks/requests";

export const projectsQueryOptions = (organizationId: string) =>
  queryOptions({
    queryKey: queryKeys.projects(organizationId),
    queryFn: ({ signal }) => listProjects({ data: { organizationId }, signal }),
    refetchInterval: 5000,
    retry: false,
  });
export const projectQueryOptions = (organizationId: string, projectEntityId: string) =>
  queryOptions({
    queryKey: queryKeys.project(organizationId, projectEntityId),
    meta: { refreshError: "Couldn’t refresh project" },
    queryFn: ({ signal }) => getProject({ data: { organizationId, projectEntityId }, signal }),
    refetchInterval: 5000,
    retry: false,
  });
export const taskCommentsQueryOptions = (
  organizationId: string,
  projectEntityId: string,
  taskEntityId: string,
) =>
  queryOptions({
    queryKey: queryKeys.taskComments(organizationId, projectEntityId, taskEntityId),
    queryFn: ({ signal }) =>
      listTaskComments({ data: { organizationId, projectEntityId, taskEntityId }, signal }),
    refetchInterval: 5000,
    retry: false,
  });
