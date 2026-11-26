import type { AgentRequestView, AgentTurnView } from "@substrate/contracts/agent-work";
import { liveTurnStatuses } from "@substrate/contracts/agent-work";

import { useEffect, useRef } from "react";

import { NeedsAttention } from "./needs-attention";
import { PendingReply } from "./pending-reply";
import { TechnicalDetails } from "./technical-details";
import { useStopTurn } from "./use-stop-turn";
import type { TurnVisibilityChange } from "./use-visible-turn-statuses";
import { MutedWorkLine, WorkStatus } from "./work-status";
import { WorkStatusTag } from "./work-status-tag";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { useNow } from "@/hooks/use-now";
import { failedWorkNote, silentLabel, turnLabel, turnTone } from "@/lib/agent-work/status";

type TurnProps = {
  turn: AgentTurnView;
  openRequest?: AgentRequestView;
  onTranscript: (turnId: string) => void;
  onVisibilityChange?: TurnVisibilityChange;
  agentName?: string;
};

/** One turn's status line, with its own clock so only this text renders each second. */
export function TurnLabel({ turn, openRequest }: Pick<TurnProps, "turn" | "openRequest">) {
  const now = useNow(liveTurnStatuses.includes(turn.status));
  return <>{turnLabel(turn, now, openRequest)}</>;
}

/** One turn's status tag, with its own clock so a live turn does not render the whole list. */
export function TurnStatusTag({ turn }: Pick<TurnProps, "turn">) {
  const now = useNow(liveTurnStatuses.includes(turn.status));
  return <WorkStatusTag status={{ tone: turnTone(turn), label: turnLabel(turn, now) }} />;
}

/** One local turn's status, for the header of the reply it belongs to. */
export function TurnStatus(props: TurnProps) {
  // Muted turns mount no clock and no actions.
  if (turnTone(props.turn, props.openRequest) === "muted") return null;
  return <LiveTurnStatus {...props} />;
}

function LiveTurnStatus({
  turn,
  openRequest,
  onTranscript,
  onVisibilityChange,
  agentName,
}: TurnProps) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || !onVisibilityChange) return;
    const observer = new IntersectionObserver(([entry]) => {
      onVisibilityChange(turn.id, element, entry.isIntersecting);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      onVisibilityChange(turn.id, element, false);
    };
  }, [turn.id, onVisibilityChange]);
  const { userId, organizationId } = useWorkspaceScope();
  const now = useNow(liveTurnStatuses.includes(turn.status));
  const { onStop, stopping } = useStopTurn(userId, organizationId, turn);
  const tone = turnTone(turn, openRequest);
  const label = turnLabel(turn, now, openRequest);
  return (
    <span ref={ref} className="inline-flex min-w-0">
      <WorkStatus
        tone={tone}
        label={
          agentName ? `${agentName}${tone === "working" ? " is working" : ""} · ${label}` : label
        }
        activity={turn.activity}
        onTranscript={() => onTranscript(turn.id)}
        onStop={onStop}
        stopping={stopping}
      />
    </span>
  );
}

/**
 * One local turn's body, where it belongs: its error and attention card under the agent's reply,
 * whose header shows the status. Before the agent replies, a pending reply under the owner
 * message that started it stands in, with the status in its own header.
 */
export function TurnWork({
  agentName,
  underReply,
  uncertainItemIds,
  ...props
}: TurnProps & {
  agentName: string;
  /** The turn shows under the agent's own message, not under the owner's. */
  underReply: boolean;
  /** The turn's items that the desktop couldn't confirm the agent received. */
  uncertainItemIds?: readonly string[];
}) {
  const { turn, openRequest } = props;
  const tone = turnTone(turn, openRequest);
  if (tone === "muted") return <MutedWorkLine label={silentLabel} />;
  const body = (
    <>
      {turn.status === "failed" && (
        <div className="mt-1 grid max-w-180 gap-1.5">
          <p className="text-xs text-destructive">{failedWorkNote}</p>
          {turn.error?.trim() && <TechnicalDetails>{turn.error}</TechnicalDetails>}
        </div>
      )}
      {turn.status === "needs_attention" && (
        <NeedsAttention turn={turn} agentName={agentName} uncertainItemIds={uncertainItemIds} />
      )}
    </>
  );
  if (underReply) return body;
  return (
    <PendingReply name={agentName} status={<TurnStatus {...props} agentName={agentName} />}>
      {body}
    </PendingReply>
  );
}
