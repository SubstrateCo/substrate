import { projectCapabilities } from "@substrate/contracts/access/capabilities";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { projectQueryOptions } from "./options";
import type { getProject } from "@/api/tasks/requests";
import { resourceState } from "@/lib/resource-state";

export function useProject(organizationId: string, projectEntityId: string) {
  return projectState(useQuery(projectQueryOptions(organizationId, projectEntityId)));
}

export function useLoadedProject(organizationId: string, projectEntityId: string) {
  return projectState(
    useQuery({ ...projectQueryOptions(organizationId, projectEntityId), refetchOnMount: false }),
  );
}

function projectState(query: UseQueryResult<Awaited<ReturnType<typeof getProject>>>) {
  const resource = resourceState(query);
  const capabilities = projectCapabilities({
    level: resource.data?.level,
    archived: !!resource.data?.project.archivedAt,
  });
  return { query, resource, capabilities };
}
