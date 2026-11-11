import type { AgentNeedsYou } from "@substrate/contracts/agent-work";

/**
 * What the Needs you list shows, and what the rail and the Agents app count. Every request
 * shows. An agent's needs_you status shows only when none of its requests shows, because an
 * open request already explains why the agent needs the owner.
 */
export function needsYouItems(data: AgentNeedsYou | undefined) {
  const requests = data?.requests ?? [];
  const withRequests = new Set(requests.map((request) => request.userAgentId));
  const agents = (data?.agents ?? []).filter((status) => !withRequests.has(status.userAgentId));
  return { requests, agents };
}

export function needsYouCount(data: AgentNeedsYou | undefined) {
  const { requests, agents } = needsYouItems(data);
  return requests.length + agents.length;
}
