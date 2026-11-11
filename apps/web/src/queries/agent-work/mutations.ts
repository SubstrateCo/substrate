import type {
  AgentRequestResponse,
  ApproveRoutineInput,
  CreateRoutineInput,
  ProposalAction,
  UpdateRoutineInput,
} from "@substrate/contracts/agent-work";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { agentWorkBridge } from "./bridge";
import { agentWorkInvalidations, type AgentWorkEffect } from "./invalidation";
import { approveProposal, declineProposal, respondToRequest } from "@/api/agent-work/requests";

function useRefresh(userId: string, organizationId: string) {
  const client = useQueryClient();
  return (effect: AgentWorkEffect) =>
    Promise.all(
      agentWorkInvalidations(userId, organizationId, effect).map((queryKey) =>
        client.invalidateQueries({ queryKey }),
      ),
    );
}

/** Answers and proposal decisions. They go to the server, so any owner device can make them. */
export function useRequestActions(userId: string, organizationId: string) {
  const refresh = useRefresh(userId, organizationId);
  const settled = () => refresh({ kind: "agent-work" });
  return {
    // A conflict means another device answered first. Refresh to show that answer.
    respond: useMutation({
      mutationFn: (input: { requestId: string; response: AgentRequestResponse }) =>
        respondToRequest({ data: { organizationId, ...input } }),
      onSettled: settled,
    }),
    approve: useMutation({
      mutationFn: (input: { requestId: string; action: ProposalAction | null }) =>
        approveProposal({ data: { organizationId, requestId: input.requestId } }),
      onSettled: (_data, _error, input) => refresh({ kind: "approved", action: input.action }),
    }),
    decline: useMutation({
      mutationFn: (requestId: string) => declineProposal({ data: { organizationId, requestId } }),
      onSettled: settled,
    }),
  };
}

/**
 * One action on this desktop's local work. Only the agent's home desktop offers them. Each
 * caller mounts only the actions it uses.
 */
function useLocalWorkAction<T>(
  userId: string,
  organizationId: string,
  mutationFn: (id: string) => Promise<T>,
) {
  const refresh = useRefresh(userId, organizationId);
  return useMutation({ mutationFn, onSettled: () => refresh({ kind: "local" }) });
}

export const useSendNow = (userId: string, organizationId: string) =>
  useLocalWorkAction(userId, organizationId, (itemId) => agentWorkBridge().sendNow(itemId));

/** For an item the desktop couldn't confirm the agent received. */
export const useResendItem = (userId: string, organizationId: string) =>
  useLocalWorkAction(userId, organizationId, (itemId) => agentWorkBridge().resendItem(itemId));

export const useDiscardItem = (userId: string, organizationId: string) =>
  useLocalWorkAction(userId, organizationId, (itemId) => agentWorkBridge().discardItem(itemId));

export const useStop = (userId: string, organizationId: string) =>
  useLocalWorkAction(userId, organizationId, (turnId) => agentWorkBridge().stop(turnId));

export const useRetry = (userId: string, organizationId: string) =>
  useLocalWorkAction(userId, organizationId, (turnId) => agentWorkBridge().retry(turnId));

export const useDismiss = (userId: string, organizationId: string) =>
  useLocalWorkAction(userId, organizationId, (turnId) => agentWorkBridge().dismiss(turnId));

export const useStartFresh = (userId: string, organizationId: string) =>
  useLocalWorkAction(userId, organizationId, (turnId) => agentWorkBridge().startFresh(turnId));

export const useNewTopic = (userId: string, organizationId: string) =>
  useLocalWorkAction(userId, organizationId, (conversationId) =>
    agentWorkBridge().newTopic(conversationId),
  );

export function useRoutineActions(userId: string, organizationId: string) {
  const refresh = useRefresh(userId, organizationId);
  const settled = () => refresh({ kind: "routines" });
  return {
    create: useMutation({
      mutationFn: (input: CreateRoutineInput) => agentWorkBridge().routines.create(input),
      onSettled: settled,
    }),
    update: useMutation({
      mutationFn: (input: UpdateRoutineInput) => agentWorkBridge().routines.update(input),
      onSettled: settled,
    }),
    approve: useMutation({
      mutationFn: (input: ApproveRoutineInput) => agentWorkBridge().routines.approve(input),
      onSettled: settled,
    }),
    remove: useMutation({
      mutationFn: (routineId: string) => agentWorkBridge().routines.delete(routineId),
      onSettled: settled,
    }),
  };
}
