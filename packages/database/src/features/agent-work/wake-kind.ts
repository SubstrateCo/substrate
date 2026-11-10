import { sessionKeys, type AgentWakeMessageKind } from "@startup-os/contracts/agent-work";

/**
 * Why an owner message wakes one of the owner's agents, if it does: a mention first, then a
 * direct message, then a reply in a thread the agent worked in. A disabled trigger stops it.
 */
export function wakeKind(agent: {
  mentioned: boolean;
  directMessage: boolean;
  workedInThread: boolean;
  disabled: readonly AgentWakeMessageKind[];
}): AgentWakeMessageKind | undefined {
  let kind: AgentWakeMessageKind | undefined;
  if (agent.mentioned) kind = "mention";
  else if (agent.directMessage) kind = "direct_message";
  else if (agent.workedInThread) kind = "thread_reply";
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
