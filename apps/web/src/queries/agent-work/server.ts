import { queryOptions, skipToken } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { getNeedsYou, listAgentStatus, listConversationRequests } from "@/api/agent-work/requests";

// Server reads work from every owner device. Realtime agent-work hints keep them fresh.

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

export const conversationRequestsOptions = (
  userId: string,
  organizationId: string,
  conversationId: string,
) =>
  queryOptions({
    queryKey: queryKeys.agentWorkRequests(userId, organizationId, conversationId),
    queryFn: userId
      ? ({ signal }) =>
          listConversationRequests({ data: { organizationId, conversationId }, signal })
      : skipToken,
    retry: false,
  });
