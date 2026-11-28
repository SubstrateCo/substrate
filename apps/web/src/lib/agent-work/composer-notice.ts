import type { AgentStatusView, AgentWorkTurnView } from "@substrate/contracts/agent-work";
import { liveTurnStatuses } from "@substrate/contracts/agent-work";

import type { ConversationAgent } from "./conversation-agents";

const noticeTurnStatuses = new Set([...liveTurnStatuses, "needs_attention"]);

export type NoticeLine =
  | { kind: "turn"; agent: ConversationAgent; turn: AgentWorkTurnView }
  | { kind: "no_desktop"; agent: ConversationAgent }
  | { kind: "needs_you"; agent: ConversationAgent }
  | { kind: "status"; agent: ConversationAgent; status: AgentStatusView };

export function noticeThread(sessionThreadId: string | null, anchorMessageId: string | undefined) {
  return anchorMessageId === sessionThreadId ? null : sessionThreadId;
}

export function noticeLines(input: {
  conversationId: string;
  threadId: string | null;
  agents: readonly ConversationAgent[];
  turns: readonly AgentWorkTurnView[];
  threadOf: (turn: AgentWorkTurnView) => string | null;
  statuses: ReadonlyMap<string, AgentStatusView> | undefined;
}): NoticeLine[] {
  const { threadId } = input;
  return input.agents.flatMap((agent): NoticeLine[] => {
    const current = input.turns.find(
      (turn) =>
        turn.userAgentId === agent.agentId &&
        noticeTurnStatuses.has(turn.status) &&
        input.threadOf(turn) === threadId,
    );
    if (current) return [{ kind: "turn", agent, turn: current }];
    const status = input.statuses?.get(agent.agentId);
    if (!status) return [];
    const here =
      status.liveConversationId === input.conversationId &&
      (status.liveThreadId ?? null) === threadId;
    if (!agent.member && !here) return [];
    if (!status.device) return threadId === null ? [{ kind: "no_desktop", agent }] : [];
    if (status.state === "needs_you" && threadId === null) return [{ kind: "needs_you", agent }];
    if (here || (!status.device.online && status.state !== "idle" && threadId === null))
      return [{ kind: "status", agent, status }];
    return [];
  });
}
