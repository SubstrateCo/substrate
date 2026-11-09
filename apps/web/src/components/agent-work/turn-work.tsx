import type { AgentRequestView, AgentTurnView } from "@startup-os/contracts/agent-work";
import { liveTurnStatuses } from "@startup-os/contracts/agent-work";

import { useQuery } from "@tanstack/react-query";

import { useState } from "react";

import { NeedsAttention } from "./needs-attention";
import { PendingReply } from "./pending-reply";
import { MutedWorkLine, WorkLine } from "./work-line";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { useNow } from "@/hooks/use-now";
import { turnStatus } from "@/lib/agent-work/status";
import { workSteps } from "@/lib/agent-work/transcript";
import { turnEventsOptions } from "@/queries/agent-work/local";
import { useLocalWorkActions } from "@/queries/agent-work/mutations";
import { toast } from "sonner";

/**
 * One local turn, where it belongs: under the agent's reply, or as a pending reply under the
 * owner message that started it. Steps load only while they are open.
 */
export function TurnWork({
  userId,
  organizationId,
  turn,
  agentName,
  underReply,
  openRequest,
  uncertainItemIds,
  onTranscript,
}: {
  userId: string;
  organizationId: string;
  turn: AgentTurnView;
  agentName: string;
  /** The turn shows under the agent's own message, not under the owner's. */
  underReply: boolean;
  openRequest?: AgentRequestView;
  /** The turn's items that the desktop couldn't confirm the agent received. */
  uncertainItemIds?: readonly string[];
  onTranscript: (turnId: string) => void;
}) {
  const live = liveTurnStatuses.includes(turn.status);
  const [chosen, setChosen] = useState<boolean>();
  const open = chosen ?? live;
  const now = useNow(live);
  const status = turnStatus(turn, now, openRequest);
  const events = useQuery({
    ...turnEventsOptions(userId, organizationId, turn.id),
    enabled: open,
  });
  const actions = useLocalWorkActions(userId, organizationId);
  const fail = (fallback: string) => (error: Error) =>
    toast.error(actionErrorMessage(error, fallback));
  if (status.tone === "muted") return <MutedWorkLine label={status.label} />;
  const work = (
    <WorkLine
      tone={status.tone}
      label={status.label}
      activity={turn.activity}
      error={turn.status === "failed" ? turn.error : null}
      open={open}
      onOpenChange={setChosen}
      steps={events.data && workSteps(events.data, live)}
      stepsLoading={events.isPending}
      stepsError={events.error}
      onRetrySteps={() => void events.refetch()}
      onTranscript={() => onTranscript(turn.id)}
      onStop={
        live && turn.status !== "stopping"
          ? () => actions.stop.mutate(turn.id, { onError: fail("We couldn’t stop this work.") })
          : undefined
      }
      stopping={actions.stop.isPending || turn.status === "stopping"}
      attention={
        turn.status === "needs_attention" && (
          <NeedsAttention
            userId={userId}
            organizationId={organizationId}
            turn={turn}
            agentName={agentName}
            uncertainItemIds={uncertainItemIds}
          />
        )
      }
    />
  );
  if (underReply) return work;
  return (
    <PendingReply name={agentName} tone={status.tone} label={status.label}>
      {work}
    </PendingReply>
  );
}
