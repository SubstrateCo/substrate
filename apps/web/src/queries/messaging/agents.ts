import { queryOptions } from "@tanstack/react-query";

import { listAvailableAgents } from "@/api/messaging/requests";
import { queryKeys } from "@/queries/keys";

export const messagingAgentsOptions = (organizationId: string) =>
  queryOptions({
    queryKey: [...queryKeys.messaging(organizationId), "available-agents"],
    queryFn: ({ signal }) => listAvailableAgents({ data: { organizationId }, signal }),
  });
