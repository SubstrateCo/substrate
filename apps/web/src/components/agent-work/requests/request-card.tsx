import type { AgentRequestView } from "@substrate/contracts/agent-work";

import { RequestCardView, RequestResult, type RequestPending } from "./request-card-view";
import { ApiError } from "@/api/result";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { proposalResultLink } from "@/lib/agent-work/links";
import { isOpenRequest } from "@/lib/agent-work/requests";
import { useRequestActions } from "@/queries/agent-work/mutations";
import { useProposalTarget } from "@/queries/agent-work/proposal-target";

function failure(error: Error, fallback: string) {
  return error instanceof ApiError && error.code === "CONFLICT"
    ? "Already answered on another device."
    : actionErrorMessage(error, fallback);
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
  const { respond, approve, decline } = useRequestActions(userId, organizationId);
  const open = isOpenRequest(request);
  // Resolve targets only while the owner can still decide.
  const target = useProposalTarget(organizationId, request, open);
  if (!open)
    return <RequestResult request={request} link={proposalResultLink(organizationId, request)} />;
  let pending: RequestPending | undefined;
  if (approve.isPending) pending = { kind: "approve" };
  else if (decline.isPending) pending = { kind: "decline" };
  else if (respond.isPending) {
    const response = respond.variables.response;
    pending =
      response.type === "approval"
        ? { kind: "option", optionId: response.optionId }
        : { kind: "answer" };
  }
  let error: string | undefined;
  if (respond.error) error = failure(respond.error, "We couldn’t send your answer. Try again.");
  else if (approve.error) error = failure(approve.error, "We couldn’t approve this. Try again.");
  else if (decline.error) error = failure(decline.error, "We couldn’t decline this. Try again.");
  // Each attempt clears the other actions' errors, so the card shows only the latest one.
  const reset = () => [respond, approve, decline].forEach((action) => action.reset());
  return (
    <RequestCardView
      request={request}
      target={target}
      pending={pending}
      error={error}
      onRespond={(response) => {
        reset();
        respond.mutate({ requestId: request.id, response });
      }}
      onApprove={() => {
        reset();
        approve.mutate({ requestId: request.id, action: request.proposal?.action ?? null });
      }}
      onDecline={() => {
        reset();
        decline.mutate(request.id);
      }}
    />
  );
}
