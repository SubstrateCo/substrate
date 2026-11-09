import type { AgentRequestView } from "@startup-os/contracts/agent-work";

import { RequestCardView, RequestResult } from "./request-card-view";
import { ApiError } from "@/api/result";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { proposalResultLink } from "@/lib/agent-work/links";
import { isOpenRequest } from "@/lib/agent-work/requests";
import { useRequestActions } from "@/queries/agent-work/mutations";
import { useProposalTarget } from "@/queries/agent-work/proposal-target";
import { toast } from "sonner";

function failure(error: Error, fallback: string) {
  return error instanceof ApiError && error.code === "CONFLICT"
    ? "Already answered on another device"
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
  return (
    <RequestCardView
      request={request}
      target={target}
      pending={respond.isPending || approve.isPending || decline.isPending}
      onRespond={(response) =>
        respond.mutate(
          { requestId: request.id, response },
          {
            onError: (error) =>
              toast.error(failure(error, "We couldn’t send your answer. Try again.")),
          },
        )
      }
      onApprove={() =>
        approve.mutate(
          { requestId: request.id, action: request.proposal?.action ?? null },
          {
            onError: (error) => toast.error(failure(error, "We couldn’t approve this. Try again.")),
          },
        )
      }
      onDecline={() =>
        decline.mutate(request.id, {
          onError: (error) => toast.error(failure(error, "We couldn’t decline this. Try again.")),
        })
      }
    />
  );
}
