import type { AgentNeedsYou } from "@substrate/contracts/agent-work";

/**
 * What the Needs you list shows, and what the rail and the Agents app count. Every request and
 * every stopped turn shows. An uncertain item shows on its own only when its turn is not listed;
 * otherwise the turn's card offers Resend and Discard for it. An agent's needs_you status shows
 * only when none of its requests or turns shows, because they already explain why the agent
 * needs the owner.
 */
export function needsYouItems(data: AgentNeedsYou | undefined) {
  const requests = data?.requests ?? [];
  const turns = (data?.turns ?? []).map((turn) => ({
    ...turn,
    uncertainItemIds: (data?.items ?? [])
      .filter((item) => item.turnId === turn.id)
      .map((item) => item.id),
  }));
  const listedTurns = new Set(turns.map((turn) => turn.id));
  const items = (data?.items ?? []).filter((item) => !item.turnId || !listedTurns.has(item.turnId));
  const explained = new Set([
    ...requests.map((request) => request.userAgentId),
    ...turns.map((turn) => turn.userAgentId),
    ...items.map((item) => item.userAgentId),
  ]);
  const agents = (data?.agents ?? []).filter((status) => !explained.has(status.userAgentId));
  return { requests, turns, items, agents };
}

export function needsYouCount(data: AgentNeedsYou | undefined) {
  const { requests, turns, items, agents } = needsYouItems(data);
  return requests.length + turns.length + items.length + agents.length;
}
