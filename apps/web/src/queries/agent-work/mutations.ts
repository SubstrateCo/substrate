import type {
  AgentRequestResponse,
  CreateRoutineInput,
  ProposalAction,
  UpdateRoutineInput,
} from "@substrate/contracts/agent-work";
import { createRoutineInput, updateRoutineInput } from "@substrate/contracts/agent-work";

import {
  mutationOptions,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";

import { invalidateTargets } from "../targets";
import { agentWorkInvalidations } from "./invalidation";
import { approveProposal, declineProposal, respondToRequest } from "@/api/agent-work/requests";
import {
  approveRoutine,
  createRoutine,
  deleteRoutine,
  updateRoutine,
} from "@/api/agent-work/routines";
import {
  runItemCommand,
  runTurnCommand,
  startNewTopic,
  type ItemCommand,
  type TurnCommand,
} from "@/api/agent-work/work";

export type RequestAction =
  | { kind: "respond"; requestId: string; response: AgentRequestResponse }
  | { kind: "approve"; requestId: string; action: ProposalAction | null }
  | { kind: "decline"; requestId: string };

/**
 * Answers and proposal decisions, as one mutation, so its state is always the latest attempt.
 * They go to the server, so any owner device can make them.
 */
export function requestActionMutationOptions(
  client: QueryClient,
  userId: string,
  organizationId: string,
  requests = { respondToRequest, approveProposal, declineProposal },
) {
  return mutationOptions({
    mutationFn: (input: RequestAction) => {
      const { requestId } = input;
      if (input.kind === "respond")
        return requests.respondToRequest({
          data: { organizationId, requestId, response: input.response },
        });
      if (input.kind === "approve")
        return requests.approveProposal({ data: { organizationId, requestId } });
      return requests.declineProposal({ data: { organizationId, requestId } });
    },
    // A conflict means another device answered first. Refresh to show that answer.
    onSettled: (_data, _error, input) =>
      invalidateTargets(
        client,
        agentWorkInvalidations(
          userId,
          organizationId,
          input.kind === "approve"
            ? { kind: "approved", action: input.action }
            : { kind: "agent-work" },
        ),
      ),
  });
}

export function useRequestAction(userId: string, organizationId: string) {
  return useMutation(requestActionMutationOptions(useQueryClient(), userId, organizationId));
}

/**
 * Work commands and routine changes go to the server, so any owner device can send them. A
 * conflict means the work changed first, so every outcome refreshes the owner's work.
 */
export function workMutationOptions(client: QueryClient, userId: string, organizationId: string) {
  const targets = agentWorkInvalidations(userId, organizationId, { kind: "agent-work" });
  return <TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) =>
    mutationOptions({
      mutationFn,
      onSettled: () => invalidateTargets(client, targets),
    });
}

function useWorkAction<TInput, TResult>(
  userId: string,
  organizationId: string,
  mutationFn: (input: TInput) => Promise<TResult>,
) {
  const options = workMutationOptions(useQueryClient(), userId, organizationId);
  return useMutation(options(mutationFn));
}

const itemCommand = (organizationId: string, command: ItemCommand) => (itemId: string) =>
  runItemCommand({ data: { organizationId, itemId, command } });

export const useSendNow = (userId: string, organizationId: string) =>
  useWorkAction(userId, organizationId, itemCommand(organizationId, "send-now"));

/** For an item the home desktop couldn't confirm the agent received. */
export const useResendItem = (userId: string, organizationId: string) =>
  useWorkAction(userId, organizationId, itemCommand(organizationId, "resend"));

export const useDiscardItem = (userId: string, organizationId: string) =>
  useWorkAction(userId, organizationId, itemCommand(organizationId, "discard"));

export const useStop = (userId: string, organizationId: string) =>
  useWorkAction(userId, organizationId, (turnId: string) =>
    runTurnCommand({ data: { organizationId, turnId, command: "stop" } }),
  );

export type AttentionAction = "retry" | "dismiss" | "startFresh" | "resend" | "discard";

const attentionCommands: Record<
  AttentionAction,
  { target: "turn"; command: TurnCommand } | { target: "item"; command: ItemCommand }
> = {
  retry: { target: "turn", command: "retry" },
  dismiss: { target: "turn", command: "dismiss" },
  startFresh: { target: "turn", command: "start-fresh" },
  resend: { target: "item", command: "resend" },
  discard: { target: "item", command: "discard" },
};

/**
 * The actions for a turn that needs attention, as one mutation, so its state is always the
 * latest attempt. ids are the turn for retry, dismiss, and start fresh, or the uncertain items
 * for resend and discard; the attempt fails if any of them fails.
 */
export function useAttentionAction(userId: string, organizationId: string) {
  return useWorkAction(
    userId,
    organizationId,
    ({ kind, ids }: { kind: AttentionAction; ids: readonly string[] }) => {
      const action = attentionCommands[kind];
      return Promise.all(
        ids.map((id) =>
          action.target === "turn"
            ? runTurnCommand({ data: { organizationId, turnId: id, command: action.command } })
            : runItemCommand({ data: { organizationId, itemId: id, command: action.command } }),
        ),
      );
    },
  );
}

/** @public The New topic control is hidden for now; keep this for when it returns. */
export const useNewTopic = (userId: string, organizationId: string) =>
  useWorkAction(userId, organizationId, (conversationId: string) =>
    startNewTopic({ data: { organizationId, conversationId } }),
  );

export function useRoutineActions(userId: string, organizationId: string) {
  const options = workMutationOptions(useQueryClient(), userId, organizationId);
  // Editors check each field first; parsing here guards the route contract.
  return {
    create: useMutation(
      options((input: CreateRoutineInput) =>
        createRoutine({ data: { organizationId, ...createRoutineInput.parse(input) } }),
      ),
    ),
    update: useMutation(
      options((input: UpdateRoutineInput) => {
        const { routineId, changes } = updateRoutineInput.parse(input);
        return updateRoutine({ data: { organizationId, routineId, changes } });
      }),
    ),
    remove: useMutation(
      options((routineId: string) => deleteRoutine({ data: { organizationId, routineId } })),
    ),
    /** Approves exactly the revision the owner saw. */
    approve: useMutation(
      options(({ routineId, revision }: { routineId: string; revision: number }) =>
        approveRoutine({ data: { organizationId, routineId, revision } }),
      ),
    ),
  };
}
