import type { AgentRequestResponse, AgentRequestView } from "@substrate/contracts/agent-work";

import { Link } from "@tanstack/react-router";

import { ApprovalRequest } from "./approval-request";
import { ProposalPreview } from "./proposal-preview";
import { QuestionsRequest } from "./questions-request";
import { PendingButton } from "@/components/feedback/pending-button";
import { MessageCard, MessageCardBody } from "@/components/messaging/messages/message-card";
import { useNow } from "@/hooks/use-now";
import { hiddenConversation } from "@/lib/agent-work/hidden-records";
import {
  proposalTargetHidden,
  proposalTargetLoading,
  type ProposalTarget,
} from "@/lib/agent-work/proposal-target";
import { requestDeadline, requestOutcome } from "@/lib/agent-work/requests";
import { formatDuration } from "@/lib/agent-work/time";
import type { RecordLink } from "@/lib/navigation/record-links";
import { ArrowUpRight, CircleAlert, Hand, Lightbulb } from "lucide-react";

export type RequestLink = { link: RecordLink; label: string };

export type RequestPending =
  | { kind: "approve" }
  | { kind: "decline" }
  | { kind: "answer" }
  | { kind: "option"; optionId: string };

const hiddenRequestTitle = "A request you can’t open";

export function RequestResult({
  request,
  link,
}: {
  request: AgentRequestView;
  link?: RequestLink;
}) {
  const { payload } = request;
  let title = hiddenRequestTitle;
  if (payload) title = payload.type === "proposal" ? payload.summary : payload.title;
  return (
    <p className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
      <span className="min-w-0 truncate" title={title}>
        {title}
      </span>
      <span className="shrink-0">· {requestOutcome(request)}</span>
      {link && (
        <Link
          {...link.link}
          className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
        >
          {link.label}
          <ArrowUpRight aria-hidden="true" className="size-3" />
        </Link>
      )}
    </p>
  );
}

function Deadline({ deadline }: { deadline: number }) {
  const now = useNow(true);
  const remaining = deadline - now;
  return remaining > 0 ? <>Expires in {formatDuration(remaining)}</> : <>Expired</>;
}

function RequestError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="flex items-start gap-1.5 text-xs text-destructive">
      <CircleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
      {message}
    </p>
  );
}

export function RequestCardView({
  request,
  pending,
  error,
  target,
  arriving = false,
  onRespond,
  onApprove,
  onDecline,
}: {
  request: AgentRequestView;
  pending?: RequestPending;
  error?: string;
  arriving?: boolean;
  target: ProposalTarget | null;
  onRespond: (response: AgentRequestResponse) => void;
  onApprove: () => void;
  onDecline: () => void;
}) {
  const deadline = requestDeadline(request);
  const { payload } = request;
  const busy = !!pending;
  if (!payload)
    return (
      <MessageCard icon={Hand} tone="attention" title={hiddenRequestTitle} arriving={arriving}>
        <MessageCardBody>
          <p className="text-xs text-muted-foreground">
            {request.agent.name} needs you in {hiddenConversation.toLowerCase()}.
          </p>
        </MessageCardBody>
      </MessageCard>
    );
  if (payload.type === "proposal")
    return (
      <MessageCard
        icon={Lightbulb}
        tone="attention"
        title={`${request.agent.name} proposes`}
        arriving={arriving}
      >
        <MessageCardBody>
          {request.proposal && target ? (
            <ProposalPreview target={target} />
          ) : (
            <p className="text-xs text-muted-foreground">The proposed action is unavailable.</p>
          )}
          {target && proposalTargetHidden(target) && (
            <p className="text-xs text-muted-foreground">
              You can’t open everything this changes, so you can’t approve it.
            </p>
          )}
          <RequestError message={error} />
          <div className="flex flex-wrap gap-2">
            <PendingButton
              type="button"
              size="sm"
              disabled={
                busy ||
                !request.proposal ||
                !target ||
                proposalTargetLoading(target) ||
                proposalTargetHidden(target)
              }
              pending={pending?.kind === "approve"}
              onClick={onApprove}
            >
              Approve
            </PendingButton>
            <PendingButton
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              pending={pending?.kind === "decline"}
              onClick={onDecline}
            >
              Decline
            </PendingButton>
          </div>
        </MessageCardBody>
      </MessageCard>
    );
  return (
    <MessageCard
      icon={Hand}
      tone="attention"
      title={payload.title}
      meta={deadline ? <Deadline deadline={deadline} /> : undefined}
      arriving={arriving}
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
            pending={busy}
            onSubmit={onRespond}
          />
        )}
        <RequestError message={error} />
      </MessageCardBody>
    </MessageCard>
  );
}
