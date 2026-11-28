import { infiniteQueryOptions, queryOptions, skipToken } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { getNeedsYou, listAgentStatus } from "@/api/agent-work/requests";
import { listRoutines } from "@/api/agent-work/routines";
import { getAgentActivity, getConversationWork, getTurn } from "@/api/agent-work/work";

export const agentStatusOptions = (userId: string, organizationId: string) =>
  queryOptions({
    queryKey: queryKeys.agentWorkStatus(userId, organizationId),
    queryFn:
      userId && organizationId
        ? ({ signal }) => listAgentStatus({ data: { organizationId }, signal })
        : skipToken,
    retry: false,
  });

export const needsYouOptions = (userId: string, organizationId: string | null | undefined) =>
  queryOptions({
    queryKey: queryKeys.agentWorkNeedsYou(userId, organizationId ?? ""),
    queryFn:
      userId && organizationId
        ? ({ signal }) => getNeedsYou({ data: { organizationId }, signal })
        : skipToken,
    retry: false,
  });

export const conversationWorkOptions = (
  userId: string,
  organizationId: string,
  conversationId: string,
) =>
  queryOptions({
    queryKey: queryKeys.agentWorkConversation(userId, organizationId, conversationId),
    queryFn: userId
      ? ({ signal }) => getConversationWork({ data: { organizationId, conversationId }, signal })
      : skipToken,
    retry: false,
  });

export const conversationRequestsOptions = (
  userId: string,
  organizationId: string,
  conversationId: string,
) =>
  queryOptions({
    ...conversationWorkOptions(userId, organizationId, conversationId),
    select: (work) => work.requests,
  });

export const turnOptions = (userId: string, organizationId: string, turnId: string) =>
  queryOptions({
    queryKey: queryKeys.agentWorkTurn(userId, organizationId, turnId),
    queryFn: userId
      ? ({ signal }) => getTurn({ data: { organizationId, turnId }, signal })
      : skipToken,
    retry: false,
  });

export const agentActivityOptions = (userId: string, organizationId: string, agentId: string) =>
  infiniteQueryOptions({
    queryKey: queryKeys.agentWorkActivity(userId, organizationId, agentId),
    queryFn: userId
      ? ({ pageParam, signal }: { pageParam: string | undefined; signal: AbortSignal }) =>
          getAgentActivity({ data: { organizationId, agentId, cursor: pageParam }, signal })
      : skipToken,
    initialPageParam: undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: false,
  });

export const routinesOptions = (userId: string, organizationId: string, agentId: string) =>
  queryOptions({
    queryKey: queryKeys.agentWorkRoutines(userId, organizationId, agentId),
    queryFn: userId
      ? ({ signal }) => listRoutines({ data: { organizationId, agentId }, signal })
      : skipToken,
    retry: false,
  });
