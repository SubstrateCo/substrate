import { sessionKeys, type AgentWakeMessageKind } from "@substrate/contracts/agent-work";
import { agentTriggerPrecedence } from "@substrate/contracts/agents";

/**
 * Why an owner message wakes one of the owner's agents, if it does: the first matching kind in
 * agentTriggerPrecedence. A disabled trigger stops it.
 */
export function wakeKind(agent: {
  mentioned: boolean;
  directMessage: boolean;
  workedInThread: boolean;
  disabled: readonly AgentWakeMessageKind[];
}): AgentWakeMessageKind | undefined {
  const matches: Record<AgentWakeMessageKind, boolean> = {
    mention: agent.mentioned,
    direct_message: agent.directMessage,
    thread_reply: agent.workedInThread,
  };
  const kind = agentTriggerPrecedence.find((candidate) => matches[candidate]);
  return kind && !agent.disabled.includes(kind) ? kind : undefined;
}

/** One session per DM conversation; elsewhere one per thread, keyed by its root. */
export function wakeSessionKey(
  conversationKind: "dm" | "group" | "channel",
  message: { id: string; conversationId: string; threadId: string | null },
) {
  return conversationKind === "dm"
    ? sessionKeys.dm(message.conversationId)
    : sessionKeys.thread(message.threadId ?? message.id);
}
