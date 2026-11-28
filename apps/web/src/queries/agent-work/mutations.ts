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
  type ItemCommand,
  type TurnCommand,
} from "@/api/agent-work/work";

export type RequestAction =
  | { kind: "respond"; requestId: string; response: AgentRequestResponse }
  | { kind: "approve"; requestId: string; action: ProposalAction | null }
  | { kind: "decline"; requestId: string };

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

export function useRoutineActions(userId: string, organizationId: string) {
  const options = workMutationOptions(useQueryClient(), userId, organizationId);
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
    approve: useMutation(
      options(({ routineId, revision }: { routineId: string; revision: number }) =>
        approveRoutine({ data: { organizationId, routineId, revision } }),
      ),
    ),
  };
}
