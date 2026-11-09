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

export const turnEventsOptions = (userId: string, organizationId: string, turnId: string) =>
  queryOptions({
    queryKey: queryKeys.agentWorkTurnEvents(userId, organizationId, turnId),
    queryFn: () => agentWorkBridge().turnEvents(turnId),
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
