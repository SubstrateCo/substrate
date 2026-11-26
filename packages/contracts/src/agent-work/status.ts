/** An agent's status, derived on the server from its sessions, items, turns and requests. */
export const agentStatusStates = ["idle", "working", "queued", "needs_you"] as const;
export type AgentStatusState = (typeof agentStatusStates)[number];

export const agentActivityMaxLength = 200;

/** Status precedence: needs_you, then working, then queued, else idle. */
export function agentStatusState(input: {
  openRequests: number;
  needsAttentionTurns: number;
  liveTurns: number;
  pendingItems: number;
}): AgentStatusState {
  if (input.openRequests > 0 || input.needsAttentionTurns > 0) return "needs_you";
  if (input.liveTurns > 0) return "working";
  if (input.pendingItems > 0) return "queued";
  return "idle";
}

/** Owner-only. */
export interface AgentStatusView {
  userAgentId: string;
  agent: { actorId: string; name: string };
  state: AgentStatusState;
  /** Items that wait to start a turn. */
  queuedCount: number;
  /** The live turn's place, only when the owner can still open it. */
  liveConversationId: string | null;
  liveThreadId: string | null;
  /** The live turn's activity. Null when its conversation is one the owner can no longer open. */
  activity: string | null;
  /** When the agent's work last changed. */
  updatedAt: string;
  /** The agent's home desktop, or null when no desktop runs this agent. */
  device: { id: string; name: string; online: boolean } | null;
}
