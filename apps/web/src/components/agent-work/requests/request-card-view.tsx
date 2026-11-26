import type { AgentRequestResponse, AgentRequestView } from "@substrate/contracts/agent-work";

import { ApprovalRequest } from "./approval-request";
import { QuestionsRequest } from "./questions-request";
import { MessageCard, MessageCardBody } from "@/components/messaging/messages/message-card";
import { useNow } from "@/hooks/use-now";
import { hiddenConversation } from "@/lib/agent-work/hidden-records";
import { requestDeadline, requestOutcome } from "@/lib/agent-work/requests";
import { formatDuration } from "@/lib/agent-work/time";
import { CircleAlert, Hand } from "lucide-react";

/** Which answer is being sent, so only that button says so. */
export type RequestPending = { kind: "answer" } | { kind: "option"; optionId: string };

const hiddenRequestTitle = "A request you can’t open";

/** How a request ended. */
export function RequestResult({ request }: { request: AgentRequestView }) {
  const title = request.payload?.title ?? hiddenRequestTitle;
  return (
    <p className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
      <span className="min-w-0 truncate" title={title}>
        {title}
      </span>
      <span className="shrink-0">· {requestOutcome(request)}</span>
    </p>
  );
}

function Deadline({ deadline }: { deadline: number }) {
  const now = useNow(true);
  const remaining = deadline - now;
  return remaining > 0 ? <>Expires in {formatDuration(remaining)}</> : <>Expired</>;
}

/** A failed answer, inside the card it belongs to. The draft stays so the owner can try again. */
function RequestError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="flex items-start gap-1.5 text-xs text-destructive">
      <CircleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
      {message}
    </p>
  );
}

/**
 * An open request from the agent. Questions wait until the owner answers, from any device.
 * Blocking requests show the deadline the desktop enforces.
 */
export function RequestCardView({
  request,
  pending,
  error,
  onRespond,
}: {
  request: AgentRequestView;
  pending?: RequestPending;
  /** Reviewed copy for the last failed answer. */
  error?: string;
  onRespond: (response: AgentRequestResponse) => void;
}) {
  const deadline = requestDeadline(request);
  const { payload } = request;
  // The server leaves out what a request says when its conversation is hidden from the viewer.
  if (!payload)
    return (
      <MessageCard icon={Hand} tone="attention" title={hiddenRequestTitle}>
        <MessageCardBody>
          <p className="text-xs text-muted-foreground">
            {request.agent.name} needs you in {hiddenConversation.toLowerCase()}.
          </p>
        </MessageCardBody>
      </MessageCard>
    );
  return (
    <MessageCard
      icon={Hand}
      tone="attention"
      title={payload.title}
      meta={deadline ? <Deadline deadline={deadline} /> : undefined}
    >
      <MessageCardBody>
        {payload.type === "approval" ? (
          <ApprovalRequest
            payload={payload}
            pendingOptionId={pending?.kind === "option" ? pending.optionId : undefined}
            onRespond={(optionId) => onRespond({ type: "approval", optionId })}
          />
        ) : (
          <QuestionsRequest
            key={request.id}
            payload={payload}
            pending={!!pending}
            onSubmit={onRespond}
          />
        )}
        <RequestError message={error} />
      </MessageCardBody>
    </MessageCard>
  );
}
