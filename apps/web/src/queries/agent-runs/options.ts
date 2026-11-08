import type { AgentRunRequestResponse } from "@startup-os/contracts/agent-runs";

import { useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import {
  cancelAgentRun,
  getAgentRun,
  listConversationRuns,
  respondToAgentRequest,
} from "@/api/agent-runs/requests";

export const conversationAgentRunsOptions = (
  userId: string,
  organizationId: string,
  conversationId: string,
) =>
  queryOptions({
    queryKey: queryKeys.conversationAgentRuns(userId, organizationId, conversationId),
    queryFn: ({ signal }) =>
      listConversationRuns({ data: { organizationId, conversationId }, signal }),
    retry: false,
  });

export const agentRunOptions = (userId: string, organizationId: string, runId: string) =>
  queryOptions({
    queryKey: queryKeys.agentRun(userId, organizationId, runId),
    queryFn: ({ signal }) => getAgentRun({ data: { organizationId, runId }, signal }),
    retry: false,
  });

export function useAgentRunActions(userId: string, organizationId: string) {
  const client = useQueryClient();
  const refresh = () =>
    client.invalidateQueries({ queryKey: queryKeys.agentRuns(userId, organizationId) });
  return {
    cancel: useMutation({
      mutationFn: (runId: string) => cancelAgentRun({ data: { organizationId, runId } }),
      onSettled: refresh,
    }),
    // A conflict means another client answered first. Refresh to show that answer.
    respond: useMutation({
      mutationFn: (input: { requestId: string; response: AgentRunRequestResponse }) =>
        respondToAgentRequest({ data: { organizationId, ...input } }),
      onSettled: refresh,
    }),
  };
}
