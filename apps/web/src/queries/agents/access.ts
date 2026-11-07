import { queryOptions } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { listAgentAccess } from "@/api/agents/requests";

export const agentAccessQueryOptions = (userId: string, organizationId: string, agentId: string) =>
  queryOptions({
    queryKey: queryKeys.agentAccess(userId, organizationId, agentId),
    queryFn: ({ signal }) => listAgentAccess({ organizationId, agentId }, signal),
    retry: false,
  });
