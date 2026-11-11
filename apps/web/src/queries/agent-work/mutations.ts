import type {
  AgentRequestResponse,
  ApproveRoutineInput,
  CreateRoutineInput,
  ProposalAction,
  UpdateRoutineInput,
} from "@substrate/contracts/agent-work";
import { createRoutineInput, updateRoutineInput } from "@substrate/contracts/agent-work";
import type { AgentWorkAPI } from "@substrate/contracts/agent-work/desktop";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { invalidateTargets } from "../targets";
import { agentWorkBridge } from "./bridge";
import { agentWorkInvalidations, type AgentWorkEffect } from "./invalidation";
import { approveProposal, declineProposal, respondToRequest } from "@/api/agent-work/requests";

function useRefresh(userId: string, organizationId: string) {
  const client = useQueryClient();
  return (effect: AgentWorkEffect) =>
    invalidateTargets(client, agentWorkInvalidations(userId, organizationId, effect));
}

export type RequestAction =
  | { kind: "respond"; requestId: string; response: AgentRequestResponse }
  | { kind: "approve"; requestId: string; action: ProposalAction | null }
  | { kind: "decline"; requestId: string };

/**
 * Answers and proposal decisions, as one mutation, so its state is always the latest attempt.
 * They go to the server, so any owner device can make them.
 */
export function useRequestAction(userId: string, organizationId: string) {
  const refresh = useRefresh(userId, organizationId);
  return useMutation({
    mutationFn: (input: RequestAction) => {
      const { requestId } = input;
      if (input.kind === "respond")
        return respondToRequest({ data: { organizationId, requestId, response: input.response } });
      if (input.kind === "approve") return approveProposal({ data: { organizationId, requestId } });
      return declineProposal({ data: { organizationId, requestId } });
    },
    // A conflict means another device answered first. Refresh to show that answer.
    onSettled: (_data, _error, input) =>
      refresh(
        input.kind === "approve"
          ? { kind: "approved", action: input.action }
          : { kind: "agent-work" },
      ),
  });
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

export type AttentionAction = "retry" | "dismiss" | "startFresh" | "resend" | "discard";

/**
 * The actions for a turn that needs attention, as one mutation, so its state is always the
 * latest attempt. ids are the turn for retry, dismiss, and start fresh, or the uncertain items
 * for resend and discard; the attempt fails if any of them fails.
 */
export function useAttentionAction(userId: string, organizationId: string) {
  const refresh = useRefresh(userId, organizationId);
  return useMutation({
    mutationFn: ({ kind, ids }: { kind: AttentionAction; ids: readonly string[] }) => {
      const bridge = agentWorkBridge();
      // Every one of these bridge commands has the same result.
      const calls: Record<AttentionAction, AgentWorkAPI["retry"]> = {
        retry: (id) => bridge.retry(id),
        dismiss: (id) => bridge.dismiss(id),
        startFresh: (id) => bridge.startFresh(id),
        resend: (id) => bridge.resendItem(id),
        discard: (id) => bridge.discardItem(id),
      };
      return Promise.all(ids.map(calls[kind]));
    },
    onSettled: () => refresh({ kind: "local" }),
  });
}

export const useNewTopic = (userId: string, organizationId: string) =>
  useLocalWorkAction(userId, organizationId, (conversationId) =>
    agentWorkBridge().newTopic(conversationId),
  );

export function useRoutineActions(userId: string, organizationId: string) {
  const refresh = useRefresh(userId, organizationId);
  const settled = () => refresh({ kind: "routines" });
  // Editors check each field first; parsing here guards the bridge contract.
  return {
    create: useMutation({
      mutationFn: (input: CreateRoutineInput) =>
        agentWorkBridge().routines.create(createRoutineInput.parse(input)),
      onSettled: settled,
    }),
    update: useMutation({
      mutationFn: (input: UpdateRoutineInput) =>
        agentWorkBridge().routines.update(updateRoutineInput.parse(input)),
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
