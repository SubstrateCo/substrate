import type {
  AgentRunRequestResponse,
  AgentRunRequestView,
} from "@startup-os/contracts/agent-runs";

import { ApprovalRequest } from "./approval-request";
import { QuestionsRequest } from "./questions-request";
import { useNow } from "@/hooks/use-now";
import { formatDuration, requestExpiresAt } from "@/lib/agent-runs/runs";

/** One line that says how a request ended. Used in the card and the transcript. */
export function requestOutcome(request: AgentRunRequestView) {
  if (request.status === "expired") return "Expired without an answer";
  if (request.status === "cancelled") return "Cancelled";
  if (request.status === "pending") return "Waiting for an answer";
  const response = request.response;
  if (request.payload.type === "approval" && response?.type === "approval") {
    const option = request.payload.options.find((item) => item.id === response.optionId);
    return `Answered: ${option?.label ?? response.optionId}`;
  }
  if (response?.type === "questions") {
    const answers = Object.values(response.answers).flat();
    return answers.length ? `Answered: ${answers.join(", ")}` : "Answered";
  }
  return "Answered";
}

export function AgentRunRequest({
  request,
  pending,
  onRespond,
}: {
  request: AgentRunRequestView;
  pending: boolean;
  onRespond: (response: AgentRunRequestResponse) => void;
}) {
  const open = request.status === "pending";
  const now = useNow(open);
  const remaining = requestExpiresAt(request) - now;
  if (!open || remaining <= 0)
    return (
      <p className="text-xs text-muted-foreground">
        {request.payload.title} · {open ? "Expired without an answer" : requestOutcome(request)}
      </p>
    );
  return (
    <div className="grid gap-1.5 rounded-md border bg-background p-2.5">
      {request.payload.type === "approval" ? (
        <ApprovalRequest
          payload={request.payload}
          pending={pending}
          onRespond={(optionId) => onRespond({ type: "approval", optionId })}
        />
      ) : (
        <QuestionsRequest
          key={request.id}
          payload={request.payload}
          pending={pending}
          onSubmit={onRespond}
        />
      )}
      <p className="text-xs text-muted-foreground tabular-nums">
        Expires in {formatDuration(remaining)}
      </p>
    </div>
  );
}
