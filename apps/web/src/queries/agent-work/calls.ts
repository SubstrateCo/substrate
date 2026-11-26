import type { DecideInvocationInput } from "@substrate/contracts/agent-work";
import type { AgentCallerPolicy } from "@substrate/contracts/agents";

import { queryOptions, skipToken, useMutation, useQueryClient } from "@tanstack/react-query";

import {
  decideCall,
  getCallers,
  getCallsLog,
  getMyCalls,
  removeCaller,
  saveCallerPolicy,
} from "@/api/agent-work/calls";
import { queryKeys } from "@/queries/keys";

export const callersOptions = (userId: string, organizationId: string, agentId: string) =>
  queryOptions({
    queryKey: queryKeys.agentCallers(userId, organizationId, agentId),
    queryFn:
      organizationId && userId
        ? ({ signal }) => getCallers({ data: { organizationId, agentId }, signal })
        : skipToken,
  });
export const callsLogOptions = (userId: string, organizationId: string, agentId: string) =>
  queryOptions({
    queryKey: queryKeys.agentCallsLog(userId, organizationId, agentId),
    queryFn: ({ signal }) =>
      getCallsLog({ data: { organizationId, userAgentId: agentId }, signal }),
  });
export const myCallsOptions = (userId: string, organizationId: string, conversationId: string) =>
  queryOptions({
    queryKey: queryKeys.myAgentCalls(userId, organizationId, conversationId),
    queryFn: ({ signal }) => getMyCalls({ data: { organizationId, conversationId }, signal }),
  });

export function useCallMutations(userId: string, organizationId: string, agentId: string) {
  const client = useQueryClient();
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.agentWork(userId, organizationId) }),
      client.invalidateQueries({ queryKey: queryKeys.agents(userId) }),
      client.invalidateQueries({ queryKey: queryKeys.messageTargets(organizationId) }),
      client.invalidateQueries({ queryKey: queryKeys.messagingProfiles(organizationId) }),
      client.invalidateQueries({ queryKey: queryKeys.search(organizationId) }),
    ]);
  const policy = useMutation({
    mutationFn: (policy: AgentCallerPolicy) =>
      saveCallerPolicy({ data: { organizationId, agentId, policy } }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (callerActorId: string) =>
      removeCaller({ data: { organizationId, agentId, callerActorId } }),
    onSuccess: refresh,
  });
  const decide = useMutation({
    mutationFn: ({
      invocationId,
      decision,
    }: {
      invocationId: string;
      decision: DecideInvocationInput["decision"];
    }) => decideCall({ data: { organizationId, invocationId, decision } }),
    // A lost decision race (409) must refresh the card as well.
    onSettled: refresh,
  });
  return { policy, remove, decide };
}
