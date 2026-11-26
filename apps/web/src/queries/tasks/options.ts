import { queryOptions, skipToken } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { getHomeTasks, getProject, getTaskLocation, listProjects } from "@/api/tasks/requests";

export const homeTasksOptions = (organizationId: string) =>
  queryOptions({
    queryKey: queryKeys.homeTasks(organizationId),
    queryFn: ({ signal }) => getHomeTasks({ data: { organizationId }, signal }),
    retry: false,
  });

export const projectsQueryOptions = (organizationId: string) =>
  queryOptions({
    queryKey: queryKeys.projects(organizationId),
    queryFn: ({ signal }) => listProjects({ data: { organizationId }, signal }),
    retry: false,
  });
export const archivedProjectsQueryOptions = (organizationId: string) =>
  queryOptions({
    queryKey: queryKeys.archivedProjects(organizationId),
    queryFn: ({ signal }) =>
      listProjects({ data: { organizationId, archived: "archived" }, signal }),
    retry: false,
  });
export const taskLocationQueryOptions = (organizationId: string, taskEntityId?: string) =>
  queryOptions({
    queryKey: queryKeys.taskLocation(organizationId, taskEntityId ?? ""),
    queryFn: taskEntityId
      ? ({ signal }) => getTaskLocation({ data: { organizationId, taskEntityId }, signal })
      : skipToken,
    retry: false,
  });
export const projectQueryOptions = (organizationId: string, projectEntityId?: string) =>
  queryOptions({
    queryKey: queryKeys.project(organizationId, projectEntityId ?? ""),
    meta: { refreshError: "Couldn't refresh project" },
    queryFn: projectEntityId
      ? ({ signal }) => getProject({ data: { organizationId, projectEntityId }, signal })
      : skipToken,
    retry: false,
  });
