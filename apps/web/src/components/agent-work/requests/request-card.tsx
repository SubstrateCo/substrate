import type { AgentRequestView } from "@substrate/contracts/agent-work";

import { RequestCardView, RequestResult, type RequestPending } from "./request-card-view";
import { ApiError } from "@/api/result";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { proposalResultLink } from "@/lib/agent-work/links";
import { isOpenRequest } from "@/lib/agent-work/requests";
import { useRequestAction, type RequestAction } from "@/queries/agent-work/mutations";
import { useProposalTarget } from "@/queries/agent-work/proposal-target";

const failures: Record<RequestAction["kind"], string> = {
  respond: "We couldn’t send your answer. Try again.",
  approve: "We couldn’t approve this. Try again.",
  decline: "We couldn’t decline this. Try again.",
};

function failure(error: Error, fallback: string) {
  return error instanceof ApiError && error.code === "CONFLICT"
    ? "Already answered on another device."
    : actionErrorMessage(error, fallback);
}

/** The control that shows progress while an action is sent. */
function pendingOf(input: RequestAction): RequestPending {
  if (input.kind !== "respond") return { kind: input.kind };
  return input.response.type === "approval"
    ? { kind: "option", optionId: input.response.optionId }
    : { kind: "answer" };
}

export function RequestCard({
  userId,
  organizationId,
  request,
}: {
  userId: string;
  organizationId: string;
  request: AgentRequestView;
}) {
  // One mutation, so the card shows only the latest attempt and its failure.
  const attempt = useRequestAction(userId, organizationId);
  const open = isOpenRequest(request);
  // Resolve targets only while the owner can still decide.
  const target = useProposalTarget(organizationId, request, open);
  if (!open)
    return <RequestResult request={request} link={proposalResultLink(organizationId, request)} />;
  const pending = attempt.isPending ? pendingOf(attempt.variables) : undefined;
  const error = attempt.isError
    ? failure(attempt.error, failures[attempt.variables.kind])
    : undefined;
  const requestId = request.id;
  return (
    <RequestCardView
      request={request}
      target={target}
      pending={pending}
      error={error}
      onRespond={(response) => attempt.mutate({ kind: "respond", requestId, response })}
      onApprove={() =>
        attempt.mutate({ kind: "approve", requestId, action: request.proposal?.action ?? null })
      }
      onDecline={() => attempt.mutate({ kind: "decline", requestId })}
    />
  );
}
