import type { TurnEventView } from "@substrate/contracts/agent-work";
import { turnEventsPageSize } from "@substrate/contracts/agent-work/desktop";

import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { agentWorkBridge, hasAgentWorkBridge } from "./bridge";

// Local agent work comes from the bridge on the agent's home desktop. The bridge sends change
// hints (see sync.ts), so these reads do not poll.

export const localAgentsOptions = (userId: string, organizationId: string) =>
  queryOptions({
    queryKey: queryKeys.agentWorkAgents(userId, organizationId),
    queryFn: () => agentWorkBridge().agents(),
    enabled: hasAgentWorkBridge() && !!userId,
    retry: false,
  });

export const conversationWorkOptions = (
  userId: string,
  organizationId: string,
  conversationId: string,
) =>
  queryOptions({
    queryKey: queryKeys.agentWorkConversation(userId, organizationId, conversationId),
    queryFn: () => agentWorkBridge().conversation(conversationId),
    enabled: hasAgentWorkBridge() && !!userId,
    retry: false,
  });

export const turnOptions = (userId: string, organizationId: string, turnId: string) =>
  queryOptions({
    queryKey: queryKeys.agentWorkTurn(userId, organizationId, turnId),
    queryFn: () => agentWorkBridge().turn(turnId),
    enabled: hasAgentWorkBridge() && !!userId,
    retry: false,
  });

/**
 * Every event of a turn, oldest first. The bridge returns one page per call, and a turn's events
 * are only appended, so a refetch reads the pages after the cached events.
 */
export async function loadTurnEvents(
  read: (after: number) => Promise<TurnEventView[]>,
  cached: TurnEventView[] = [],
) {
  const events = [...cached];
  for (;;) {
    const page = await read(events.at(-1)?.seq ?? 0);
    events.push(...page);
    if (page.length < turnEventsPageSize) return events;
  }
}

export const turnEventsOptions = (userId: string, organizationId: string, turnId: string) =>
  queryOptions({
    queryKey: queryKeys.agentWorkTurnEvents(userId, organizationId, turnId),
    queryFn: ({ client, queryKey }) =>
      loadTurnEvents(
        (after) => agentWorkBridge().turnEvents(turnId, after),
        client.getQueryData<TurnEventView[]>(queryKey),
      ),
    enabled: hasAgentWorkBridge() && !!userId,
    retry: false,
  });

export const agentActivityOptions = (userId: string, organizationId: string, agentId: string) =>
  infiniteQueryOptions({
    queryKey: queryKeys.agentWorkActivity(userId, organizationId, agentId),
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      agentWorkBridge().agentActivity(agentId, pageParam),
    initialPageParam: undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: hasAgentWorkBridge() && !!userId,
    retry: false,
  });

export const routinesOptions = (userId: string, organizationId: string, agentId: string) =>
  queryOptions({
    queryKey: queryKeys.agentWorkRoutines(userId, organizationId, agentId),
    queryFn: () => agentWorkBridge().routines.list(agentId),
    enabled: hasAgentWorkBridge() && !!userId,
    retry: false,
  });
