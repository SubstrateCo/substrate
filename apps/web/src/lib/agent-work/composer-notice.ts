import type { AgentStatusView, AgentTurnView } from "@substrate/contracts/agent-work";
import { liveTurnStatuses } from "@substrate/contracts/agent-work";

import type { ConversationAgent } from "./conversation-agents";

const noticeTurnStatuses = new Set([...liveTurnStatuses, "needs_attention"]);

/** One agent's line above the composer, before it gets its copy and links. */
export type NoticeLine =
  | { kind: "turn"; agent: ConversationAgent; turn: AgentTurnView }
  | { kind: "no_desktop"; agent: ConversationAgent }
  | { kind: "needs_you"; agent: ConversationAgent }
  | { kind: "status"; agent: ConversationAgent; status: AgentStatusView };

/**
 * What each agent here is doing, for the composer of the conversation (`threadId` null) or of
 * one thread. An agent homed on this desktop shows its live turn in that place. Other agents
 * show their published status where they work now; the conversation's own composer also shows
 * agents that need a desktop, need you, or are offline with work.
 */
export function noticeLines(input: {
  conversationId: string;
  threadId: string | null;
  agents: readonly ConversationAgent[];
  /** Agents homed on this desktop, by agent ID. */
  homed: ReadonlyMap<string, unknown>;
  turns: readonly AgentTurnView[];
  /** The thread where a turn's session started, or null for the conversation. */
  threadOf: (turn: AgentTurnView) => string | null;
  statuses: ReadonlyMap<string, AgentStatusView> | undefined;
}): NoticeLine[] {
  const { threadId } = input;
  return input.agents.flatMap((agent): NoticeLine[] => {
    if (input.homed.has(agent.agentId)) {
      const current = input.turns.find(
        (turn) =>
          turn.userAgentId === agent.agentId &&
          noticeTurnStatuses.has(turn.status) &&
          input.threadOf(turn) === threadId,
      );
      return current ? [{ kind: "turn", agent, turn: current }] : [];
    }
    const status = input.statuses?.get(agent.agentId);
    if (!status) return [];
    const here =
      status.liveConversationId === input.conversationId &&
      (status.liveThreadId ?? null) === threadId;
    // General lines describe the agent as a whole, so they show only where it is a member.
    if (!agent.member && !here) return [];
    if (!status.device) return threadId === null ? [{ kind: "no_desktop", agent }] : [];
    if (status.state === "needs_you" && threadId === null) return [{ kind: "needs_you", agent }];
    if (here || (!status.device.online && status.state !== "idle" && threadId === null))
      return [{ kind: "status", agent, status }];
    return [];
  });
}
