import { queryOptions } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { getProject, getTaskLocation, listProjects } from "@/api/tasks/requests";

export const projectsQueryOptions = (organizationId: string) =>
  queryOptions({
    queryKey: queryKeys.projects(organizationId),
    queryFn: ({ signal }) => listProjects({ data: { organizationId }, signal }),
    retry: false,
  });
export const taskLocationQueryOptions = (organizationId: string, taskEntityId: string) =>
  queryOptions({
    queryKey: queryKeys.taskLocation(organizationId, taskEntityId),
    queryFn: ({ signal }) => getTaskLocation({ data: { organizationId, taskEntityId }, signal }),
    retry: false,
  });
export const projectQueryOptions = (organizationId: string, projectEntityId: string) =>
  queryOptions({
    queryKey: queryKeys.project(organizationId, projectEntityId),
    meta: { refreshError: "Couldn’t refresh project" },
    queryFn: ({ signal }) => getProject({ data: { organizationId, projectEntityId }, signal }),
    retry: false,
  });
