import type { AgentWorkChange } from "@startup-os/contracts/agent-work/desktop";

import { useQueryClient, type QueryKey } from "@tanstack/react-query";

import { useEffect } from "react";

import { queryKeys } from "../keys";

/**
 * The local reads a bridge change hint names. A hint without IDs refreshes all local work.
 * The agent list always refreshes, because every change can move an agent's state.
 *
 * Conversation work holds turns and items, so a turn or agent change, such as steering or a new
 * output, also changes it. Without a conversation ID the hint can't say which conversation, so
 * it refreshes every conversation's local work. Only mounted ones refetch.
 */
export function bridgeChangeTargets(
  userId: string,
  organizationId: string,
  change: AgentWorkChange,
): QueryKey[] {
  if (!change.conversationId && !change.turnId && !change.userAgentId)
    return [queryKeys.agentWorkLocal(userId, organizationId)];
  const keys: QueryKey[] = [queryKeys.agentWorkAgents(userId, organizationId)];
  keys.push(
    change.conversationId
      ? queryKeys.agentWorkConversation(userId, organizationId, change.conversationId)
      : queryKeys.agentWorkConversations(userId, organizationId),
  );
  if (change.turnId)
    keys.push(queryKeys.agentWorkTurnEvents(userId, organizationId, change.turnId));
  if (change.userAgentId)
    keys.push(
      queryKeys.agentWorkActivity(userId, organizationId, change.userAgentId),
      queryKeys.agentWorkRoutines(userId, organizationId, change.userAgentId),
    );
  return keys;
}

/** Keeps local agent work fresh on the home desktop. Mount once in the workspace frame. */
export function useAgentWorkBridgeSync(userId: string | undefined, organizationId?: string | null) {
  const client = useQueryClient();
  useEffect(() => {
    const bridge = window.startupOSAgentWork;
    if (!bridge || !userId || !organizationId) return;
    return bridge.onChange((change) => {
      for (const queryKey of bridgeChangeTargets(userId, organizationId, change))
        void client.invalidateQueries({ queryKey });
    });
  }, [client, userId, organizationId]);
}
