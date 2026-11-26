import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { projectQueryOptions } from "./options";
import type { getProject } from "@/api/tasks/requests";
import { resourceState } from "@/lib/resource-state";
import { projectCapabilities } from "@/lib/tasks/project-capabilities";

/** A project page's project: its query, load state, and what the reader may do in it. */
export function useProject(organizationId: string, projectEntityId: string) {
  return projectState(useQuery(projectQueryOptions(organizationId, projectEntityId)));
}

/**
 * The project that a `useProject` parent already loads. It shares that cache entry and leaves
 * refreshing to the parent, so opening a task, form, or dialog doesn't refetch the project.
 */
export function useLoadedProject(organizationId: string, projectEntityId: string) {
  return projectState(
    useQuery({ ...projectQueryOptions(organizationId, projectEntityId), refetchOnMount: false }),
  );
}

function projectState(query: UseQueryResult<Awaited<ReturnType<typeof getProject>>>) {
  const resource = resourceState(query);
  const capabilities = projectCapabilities(
    resource.data?.level,
    !!resource.data?.project.archivedAt,
  );
  return { query, resource, capabilities };
}
