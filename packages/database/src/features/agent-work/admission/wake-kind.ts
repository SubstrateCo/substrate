import { sessionKeys } from "@substrate/contracts/agent-work";
import { agentTriggerPrecedence, type AgentTriggerKind } from "@substrate/contracts/agents";
import { isDirectConversation, type ConversationKind } from "@substrate/contracts/messaging/input";

export function wakeKind(agent: {
  mentioned: boolean;
  directMessage: boolean;
  workedInThread: boolean;
  disabled: readonly AgentTriggerKind[];
}): AgentTriggerKind | undefined {
  const matches: Record<AgentTriggerKind, boolean> = {
    mention: agent.mentioned,
    direct_message: agent.directMessage,
    thread_reply: agent.workedInThread,
  };
  const kind = agentTriggerPrecedence.find((candidate) => matches[candidate]);
  return kind && !agent.disabled.includes(kind) ? kind : undefined;
}

export function wakeSessionKey(
  conversationKind: ConversationKind,
  message: { id: string; conversationId: string; threadId: string | null },
) {
  return isDirectConversation(conversationKind)
    ? sessionKeys.dm(message.conversationId)
    : sessionKeys.thread(message.threadId ?? message.id);
}
