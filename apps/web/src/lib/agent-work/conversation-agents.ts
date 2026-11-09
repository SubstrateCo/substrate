import type {
  AgentRequestView,
  AgentStatusView,
  AgentTurnView,
} from "@startup-os/contracts/agent-work";

export interface ConversationAgent {
  agentId: string;
  name: string;
  /** The agent is a member now. Only members get general status lines, such as "Needs you". */
  member: boolean;
}

/**
 * The owner's agents with work in one conversation. An agent that left still has its turns,
 * requests, and live status here, so membership alone does not decide what shows. Every input
 * is already owner-scoped: members list agent IDs only for the viewer's own agents, and the
 * bridge and server return only the owner's work.
 */
export function conversationAgents(input: {
  conversationId: string;
  members: readonly { agentId: string; name: string }[];
  turns: readonly AgentTurnView[];
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
