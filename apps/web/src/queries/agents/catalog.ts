import { queryOptions } from "@tanstack/react-query";

import { listAgents } from "@/api/agents";
import { queryKeys } from "@/queries/keys";

export const agentCatalogQueryOptions = (userId: string) =>
  queryOptions({
    queryKey: queryKeys.agents(userId),
    queryFn: ({ signal }) => listAgents(signal),
  });
