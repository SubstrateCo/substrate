import type {
  AgentRunRequestResponse,
  AgentRunRequestView,
} from "@startup-os/contracts/agent-runs";

import { ApprovalRequest } from "./approval-request";
import { QuestionsRequest } from "./questions-request";
import { MessageCard, MessageCardBody } from "@/components/messaging/messages/message-card";
import { useNow } from "@/hooks/use-now";
import { formatDuration, requestExpiresAt } from "@/lib/agent-runs/runs";
import { Hand } from "lucide-react";

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
      <p className="mt-1 text-xs text-muted-foreground">
        {request.payload.title} · {open ? "Expired without an answer" : requestOutcome(request)}
      </p>
    );
  return (
    <MessageCard
      icon={Hand}
      tone="attention"
      title={request.payload.title}
      meta={`Expires in ${formatDuration(remaining)}`}
    >
      <MessageCardBody>
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
      </MessageCardBody>
    </MessageCard>
  );
}
