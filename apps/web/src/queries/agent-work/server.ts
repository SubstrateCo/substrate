import { queryOptions } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { getNeedsYou, listAgentStatus, listConversationRequests } from "@/api/agent-work/requests";

// Server reads work from every owner device. Realtime agent-work hints keep them fresh.

export const agentStatusOptions = (userId: string, organizationId: string) =>
  queryOptions({
    queryKey: queryKeys.agentWorkStatus(userId, organizationId),
    queryFn: ({ signal }) => listAgentStatus({ data: { organizationId }, signal }),
    enabled: !!userId && !!organizationId,
    retry: false,
  });

export const needsYouOptions = (userId: string, organizationId: string) =>
  queryOptions({
    queryKey: queryKeys.agentWorkNeedsYou(userId, organizationId),
    queryFn: ({ signal }) => getNeedsYou({ data: { organizationId }, signal }),
    enabled: !!userId && !!organizationId,
    retry: false,
  });

export const conversationRequestsOptions = (
  userId: string,
  organizationId: string,
  conversationId: string,
) =>
  queryOptions({
    queryKey: queryKeys.agentWorkRequests(userId, organizationId, conversationId),
    queryFn: ({ signal }) =>
      listConversationRequests({ data: { organizationId, conversationId }, signal }),
    enabled: !!userId,
    retry: false,
  });
