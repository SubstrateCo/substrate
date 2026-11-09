import type { AgentRequestResponse, AgentRequestView } from "@startup-os/contracts/agent-work";

import { ApprovalRequest } from "./approval-request";
import { hiddenConversation, ProposalPreview } from "./proposal-preview";
import { QuestionsRequest } from "./questions-request";
import { MessageCard, MessageCardBody } from "@/components/messaging/messages/message-card";
import { Button } from "@/components/ui/button";
import { useNow } from "@/hooks/use-now";
import {
  proposalTargetHidden,
  proposalTargetLoading,
  type ProposalTarget,
} from "@/lib/agent-work/proposal-target";
import { requestDeadline, requestOutcome } from "@/lib/agent-work/requests";
import { formatDuration } from "@/lib/agent-work/time";
import { ArrowUpRight, Hand, Lightbulb } from "lucide-react";

export type RequestLink = { href: string; label: string };

const hiddenRequestTitle = "A request you can't open";

/** How a request ended, with a forward link to what an approved proposal created. */
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
        <a
          href={link.href}
          className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
        >
          {link.label}
          <ArrowUpRight aria-hidden="true" className="size-3" />
        </a>
      )}
    </p>
  );
}

function Deadline({ deadline }: { deadline: number }) {
  const now = useNow(true);
  const remaining = deadline - now;
  return remaining > 0 ? <>Expires in {formatDuration(remaining)}</> : <>Expired</>;
}

/**
 * An open request from the agent. Questions and proposals wait until the owner answers, from
 * any device. Blocking requests show the deadline the desktop enforces.
 */
export function RequestCardView({
  request,
  pending,
  target,
  onRespond,
  onApprove,
  onDecline,
}: {
  request: AgentRequestView;
  pending: boolean;
  /** The records the proposal names, resolved for the viewer. Null for other requests. */
  target: ProposalTarget | null;
  onRespond: (response: AgentRequestResponse) => void;
  onApprove: () => void;
  onDecline: () => void;
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
  if (payload.type === "proposal")
    return (
      <MessageCard icon={Lightbulb} tone="attention" title={`${request.agent.name} proposes`}>
        <MessageCardBody>
          {request.proposal && target ? (
            <ProposalPreview action={request.proposal.action} target={target} />
          ) : (
            <p className="text-xs text-muted-foreground">The proposed action is unavailable.</p>
          )}
          {/* The agent's own words. The preview above, not this text, says what approval does. */}
          <p className="text-xs text-muted-foreground">
            {request.agent.name}’s note: {payload.summary}
          </p>
          {target && proposalTargetHidden(target) && (
            <p className="text-xs text-muted-foreground">
              You can’t open everything this changes, so you can’t approve it.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={
                pending ||
                !request.proposal ||
                !target ||
                proposalTargetLoading(target) ||
                proposalTargetHidden(target)
              }
              onClick={onApprove}
            >
              Approve
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={onDecline}
            >
              Decline
            </Button>
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
    >
      <MessageCardBody>
        {payload.type === "approval" ? (
          <ApprovalRequest
            payload={payload}
            pending={pending}
            onRespond={(optionId) => onRespond({ type: "approval", optionId })}
          />
        ) : (
          <QuestionsRequest
            key={request.id}
            payload={payload}
            pending={pending}
            onSubmit={onRespond}
          />
        )}
      </MessageCardBody>
    </MessageCard>
  );
}
