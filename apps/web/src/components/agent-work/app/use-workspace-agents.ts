import { useQuery } from "@tanstack/react-query";

import { agentStatus } from "@/lib/agent-work/status";
import { resourceState } from "@/lib/resource-state";
import { agentStatusOptions } from "@/queries/agent-work/server";
import { agentCatalogQueryOptions } from "@/queries/agents/catalog";

/** The viewer's agents with their status, and the selected one. */
export function useWorkspaceAgents(userId: string, organizationId: string, agentId?: string) {
  const catalog = useQuery(agentCatalogQueryOptions(userId));
  const catalogState = resourceState(catalog);
  const statuses = useQuery(agentStatusOptions(userId, organizationId));
  const status = (id: string) => statuses.data?.find((entry) => entry.userAgentId === id);
  const agents = (catalogState.data?.agents ?? []).map((agent) => {
    const derived = status(agent.id);
    return {
      id: agent.id,
      name: agent.name,
      enabled: agent.enabled,
      image: agent.image,
      status: derived && agentStatus(derived),
    };
  });
  return {
    catalogState,
    retryCatalog: () => void catalog.refetch(),
    agents,
    status,
    selected: agents.find((agent) => agent.id === agentId),
    firstAgent: catalogState.status === "ready" && !agents.length,
  };
}
