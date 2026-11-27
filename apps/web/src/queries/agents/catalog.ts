import { queryOptions } from "@tanstack/react-query";

import { listAgents } from "@/api/agents/requests";
import { queryKeys } from "@/queries/keys";

export const agentCatalogQueryOptions = (userId: string) =>
  queryOptions({
    queryKey: queryKeys.agents(userId),
    queryFn: ({ signal }) => listAgents(signal),
  });

/** One of the viewer's own agents' avatar code, or null until the catalog loads. */
export const agentAvatarQueryOptions = (userId: string, agentId: string) =>
  queryOptions({
    ...agentCatalogQueryOptions(userId),
    select: (catalog) => catalog.agents.find((agent) => agent.id === agentId)?.avatar ?? null,
  });
