import type { AgentRequestView } from "@substrate/contracts/agent-work";

import { RequestCardView, RequestResult, type RequestPending } from "./request-card-view";
import { ApiError } from "@/api/result";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { Fold } from "@/components/motion/fold";
import { useArrivedLive } from "@/components/motion/use-arrived-live";
import { useOrganizationApps } from "@/components/workspace/organization-apps-context";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
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

function pendingOf(input: RequestAction): RequestPending {
  if (input.kind !== "respond") return { kind: input.kind };
  return input.response.type === "approval"
    ? { kind: "option", optionId: input.response.optionId }
    : { kind: "answer" };
}

export function RequestCard({ request }: { request: AgentRequestView }) {
  const { userId, organizationId } = useWorkspaceScope();
  const attempt = useRequestAction(userId, organizationId);
  const open = isOpenRequest(request);
  const apps = useOrganizationApps();
  const target = useProposalTarget(organizationId, request, {
    enabled: open,
    crmEnabled: apps.enabled("crm"),
  });
  const arriving = useArrivedLive(request.createdAt);
  if (!open)
    return (
      <Fold state="closed">
        <RequestResult request={request} link={proposalResultLink(organizationId, request)} />
      </Fold>
    );
  const pending = attempt.isPending ? pendingOf(attempt.variables) : undefined;
  const error = attempt.isError
    ? failure(attempt.error, failures[attempt.variables.kind])
    : undefined;
  const requestId = request.id;
  return (
    <Fold state="open">
      <RequestCardView
        request={request}
        target={target}
        pending={pending}
        error={error}
        arriving={arriving}
        onRespond={(response) => attempt.mutate({ kind: "respond", requestId, response })}
        onApprove={() =>
          attempt.mutate({ kind: "approve", requestId, action: request.proposal?.action ?? null })
        }
        onDecline={() => attempt.mutate({ kind: "decline", requestId })}
      />
    </Fold>
  );
}
