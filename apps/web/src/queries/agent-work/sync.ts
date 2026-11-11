import type { AgentWorkChange } from "@substrate/contracts/agent-work/desktop";

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

function startsWith(key: QueryKey, prefix: QueryKey) {
  return prefix.length < key.length && prefix.every((part, index) => part === key[index]);
}

/**
 * Collects the keys of bridge change hints for a short window, then invalidates each distinct
 * key once. The desktop sends several hints within milliseconds, each naming the agent list.
 * A key that another pending key covers, such as any local read under the all-local key, is
 * dropped.
 */
export function createBridgeChangeBatcher(
  userId: string,
  organizationId: string,
  invalidate: (queryKey: QueryKey) => void,
) {
  const pending = new Map<string, QueryKey>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  function flush() {
    timer = undefined;
    const keys = [...pending.values()];
    pending.clear();
    for (const key of keys) if (!keys.some((other) => startsWith(key, other))) invalidate(key);
  }
  return {
    receive(change: AgentWorkChange) {
      for (const key of bridgeChangeTargets(userId, organizationId, change))
        pending.set(JSON.stringify(key), key);
      timer ??= setTimeout(flush, 50);
    },
    dispose() {
      clearTimeout(timer);
      timer = undefined;
      pending.clear();
    },
  };
}

/** Keeps local agent work fresh on the home desktop. Mount once in the workspace frame. */
export function useAgentWorkBridgeSync(userId: string | undefined, organizationId?: string | null) {
  const client = useQueryClient();
  useEffect(() => {
    const bridge = window.substrateAgentWork;
    if (!bridge || !userId || !organizationId) return;
    const batcher = createBridgeChangeBatcher(userId, organizationId, (queryKey) => {
      void client.invalidateQueries({ queryKey });
    });
    const unsubscribe = bridge.onChange((change) => batcher.receive(change));
    return () => {
      unsubscribe();
      batcher.dispose();
    };
  }, [client, userId, organizationId]);
}
