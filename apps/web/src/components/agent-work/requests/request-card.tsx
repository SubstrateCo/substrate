import type { AgentRequestView } from "@substrate/contracts/agent-work";

import { RequestCardView, RequestResult, type RequestPending } from "./request-card-view";
import { ApiError } from "@/api/result";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { isOpenRequest } from "@/lib/agent-work/requests";
import { useRequestAction, type RequestAction } from "@/queries/agent-work/mutations";

function failure(error: Error) {
  return error instanceof ApiError && error.code === "CONFLICT"
    ? "Already answered on another device."
    : actionErrorMessage(error, "We couldn’t send your answer. Try again.");
}

/** The control that shows progress while an answer is sent. */
function pendingOf({ response }: RequestAction): RequestPending {
  return response.type === "approval"
    ? { kind: "option", optionId: response.optionId }
    : { kind: "answer" };
}

export function RequestCard({ request }: { request: AgentRequestView }) {
  const { userId, organizationId } = useWorkspaceScope();
  // One mutation, so the card shows only the latest attempt and its failure.
  const attempt = useRequestAction(userId, organizationId);
  if (!isOpenRequest(request)) return <RequestResult request={request} />;
  const pending = attempt.isPending ? pendingOf(attempt.variables) : undefined;
  const error = attempt.isError ? failure(attempt.error) : undefined;
  const requestId = request.id;
  return (
    <RequestCardView
      request={request}
      pending={pending}
      error={error}
      onRespond={(response) => attempt.mutate({ requestId, response })}
    />
  );
}
