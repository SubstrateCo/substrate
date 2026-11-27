import type { AgentNeedsYou } from "./request-views.ts";

/** Match the Needs you list without counting an agent or uncertain item twice. */
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
