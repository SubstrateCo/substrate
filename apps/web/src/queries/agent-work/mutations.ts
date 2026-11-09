import type {
  AgentRequestResponse,
  ApproveRoutineInput,
  CreateRoutineInput,
  ProposalAction,
  UpdateRoutineInput,
} from "@startup-os/contracts/agent-work";

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

/** Actions on this desktop's local work. Only the agent's home desktop offers them. */
export function useLocalWorkActions(userId: string, organizationId: string) {
  const refresh = useRefresh(userId, organizationId);
  const settled = () => refresh({ kind: "agent-work" });
  return {
    sendNow: useMutation({
      mutationFn: (itemId: string) => agentWorkBridge().sendNow(itemId),
      onSettled: settled,
    }),
    // For an item the desktop couldn't confirm the agent received.
    resend: useMutation({
      mutationFn: (itemId: string) => agentWorkBridge().resendItem(itemId),
      onSettled: settled,
    }),
    discard: useMutation({
      mutationFn: (itemId: string) => agentWorkBridge().discardItem(itemId),
      onSettled: settled,
    }),
    stop: useMutation({
      mutationFn: (turnId: string) => agentWorkBridge().stop(turnId),
      onSettled: settled,
    }),
    retry: useMutation({
      mutationFn: (turnId: string) => agentWorkBridge().retry(turnId),
      onSettled: settled,
    }),
    dismiss: useMutation({
      mutationFn: (turnId: string) => agentWorkBridge().dismiss(turnId),
      onSettled: settled,
    }),
    startFresh: useMutation({
      mutationFn: (turnId: string) => agentWorkBridge().startFresh(turnId),
      onSettled: settled,
    }),
    newTopic: useMutation({
      mutationFn: (conversationId: string) => agentWorkBridge().newTopic(conversationId),
      onSettled: settled,
    }),
  };
}

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
