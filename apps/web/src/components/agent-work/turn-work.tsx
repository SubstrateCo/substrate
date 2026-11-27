import type { AgentRequestView, AgentWorkTurnView } from "@substrate/contracts/agent-work";
import { liveTurnStatuses } from "@substrate/contracts/agent-work";

import { useQuery } from "@tanstack/react-query";

import { useEffect, useRef } from "react";

import { NeedsAttention } from "./needs-attention";
import { NeedsAttentionCard } from "./needs-attention-card";
import { PendingReply } from "./pending-reply";
import { TechnicalDetails } from "./technical-details";
import { useStopTurn } from "./use-stop-turn";
import type { TurnVisibilityChange } from "./use-visible-turn-statuses";
import { MutedWorkLine, WorkStatus } from "./work-status";
import { WorkStatusTag } from "./work-status-tag";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { useNow } from "@/hooks/use-now";
import {
  failedWorkNote,
  silentLabel,
  turnLabel,
  turnMood,
  turnTone,
} from "@/lib/agent-work/status";
import { agentAvatarQueryOptions } from "@/queries/agents/catalog";

type TurnProps = {
  turn: AgentWorkTurnView;
  openRequest?: AgentRequestView;
  onTranscript: (turnId: string) => void;
  onVisibilityChange?: TurnVisibilityChange;
  /** Shows the latest activity after the label. The pending reply shows it on its own line. */
  inlineActivity?: boolean;
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

/** One turn's status, for the header of the reply it belongs to. */
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
  inlineActivity = true,
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
    <span ref={ref} data-turn-status={turn.id} className="flex min-w-0 flex-1">
      <WorkStatus
        tone={tone}
        label={label}
        activity={inlineActivity ? turn.activity : null}
        onTranscript={() => onTranscript(turn.id)}
        onStop={onStop}
        stopping={stopping}
      />
    </span>
  );
}

/** What live work is doing, on the line where the agent's reply will go. */
function activityLine(turn: AgentWorkTurnView) {
  if (turn.activity) return turn.activity;
  return turn.status === "assigned" ? "Getting started…" : "Thinking…";
}

/** A failed turn's note, or the owner's actions for a turn that needs attention. */
function TurnBody({
  turn,
  agentName,
  uncertainItemIds,
}: {
  turn: AgentWorkTurnView;
  agentName: string;
  uncertainItemIds?: readonly string[];
}) {
  if (turn.status === "failed")
    return (
      <div className="mt-1 grid max-w-180 gap-1.5">
        <p className="text-xs text-destructive">{failedWorkNote}</p>
        {turn.error?.trim() && <TechnicalDetails>{turn.error}</TechnicalDetails>}
      </div>
    );
  if (turn.status === "needs_attention")
    return (
      <NeedsAttentionCard>
        <NeedsAttention turn={turn} agentName={agentName} uncertainItemIds={uncertainItemIds} />
      </NeedsAttentionCard>
    );
  return null;
}

/**
 * One turn's body, where it belongs: its error and attention card under the agent's reply,
 * whose header shows the status. Before the agent replies, a separate reply row after the
 * source message stands in. Quiet turns keep their result in that same row.
 */
export function TurnWork({
  agentName,
  underReply,
  uncertainItemIds,
  ...props
}: Omit<TurnProps, "inlineActivity"> & {
  agentName: string;
  /** The turn shows under the agent's own message, not under the owner's. */
  underReply: boolean;
  /** The turn's items that the desktop couldn't confirm the agent received. */
  uncertainItemIds?: readonly string[];
}) {
  const { turn, openRequest } = props;
  const { userId } = useWorkspaceScope();
  // Only the owner sees agent work, so the agent is in the viewer's own catalog.
  const { data: avatar } = useQuery(agentAvatarQueryOptions(userId, turn.userAgentId));
  const tone = turnTone(turn, openRequest);
  if (underReply)
    return (
      <div className="pr-4 pl-16">
        {tone === "muted" ? (
          <MutedWorkLine label={silentLabel} />
        ) : (
          <TurnBody turn={turn} agentName={agentName} uncertainItemIds={uncertainItemIds} />
        )}
      </div>
    );
  const body = <TurnBody turn={turn} agentName={agentName} uncertainItemIds={uncertainItemIds} />;
  let line: string | undefined;
  if (tone === "muted") line = silentLabel;
  else if (tone === "working") line = activityLine(turn);
  return (
    <PendingReply
      name={agentName}
      avatar={avatar ?? null}
      mood={turnMood(turn, openRequest)}
      tone={tone}
      status={<TurnStatus {...props} inlineActivity={false} />}
      line={line}
    >
      {body}
    </PendingReply>
  );
}
