import type {
  AgentRequestView,
  AgentStatusView,
  AgentWorkTurnView,
} from "@substrate/contracts/agent-work";

export interface ConversationAgent {
  agentId: string;
  name: string;
  member: boolean;
}

export function conversationAgents(input: {
  conversationId: string;
  members: readonly { agentId: string; name: string }[];
  turns: readonly AgentWorkTurnView[];
  requests: readonly AgentRequestView[];
  statuses: readonly AgentStatusView[];
}): ConversationAgent[] {
  const agents = new Map<string, ConversationAgent>();
  for (const member of input.members)
    agents.set(member.agentId, { agentId: member.agentId, name: member.name, member: true });
  const named = new Map<string, string>();
  for (const status of input.statuses) named.set(status.userAgentId, status.agent.name);
  for (const request of input.requests) named.set(request.userAgentId, request.agent.name);
  const add = (agentId: string) => {
    if (!agents.has(agentId))
      agents.set(agentId, { agentId, name: named.get(agentId) ?? "Agent", member: false });
  };
  for (const turn of input.turns) add(turn.userAgentId);
  for (const request of input.requests) add(request.userAgentId);
  for (const status of input.statuses)
    if (status.liveConversationId === input.conversationId) add(status.userAgentId);
  return [...agents.values()];
}
