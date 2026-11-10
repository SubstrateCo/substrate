import type { AgentRequestView, AgentTurnView } from "@startup-os/contracts/agent-work";
import { liveTurnStatuses } from "@startup-os/contracts/agent-work";

import { NeedsAttention } from "./needs-attention";
import { PendingReply } from "./pending-reply";
import { TechnicalDetails } from "./technical-details";
import { MutedWorkLine, WorkStatus } from "./work-status";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { useNow } from "@/hooks/use-now";
import { failedWorkNote, turnStatus } from "@/lib/agent-work/status";
import { useLocalWorkActions } from "@/queries/agent-work/mutations";
import { toast } from "sonner";

type TurnProps = {
  userId: string;
  organizationId: string;
  turn: AgentTurnView;
  openRequest?: AgentRequestView;
  onTranscript: (turnId: string) => void;
};

/** One local turn's status, for the header of the reply it belongs to. */
export function TurnStatus({ userId, organizationId, turn, openRequest, onTranscript }: TurnProps) {
  const live = liveTurnStatuses.includes(turn.status);
  const now = useNow(live);
  const status = turnStatus(turn, now, openRequest);
  const actions = useLocalWorkActions(userId, organizationId);
  if (status.tone === "muted") return null;
  return (
    <WorkStatus
      tone={status.tone}
      label={status.label}
      activity={turn.activity}
      onTranscript={() => onTranscript(turn.id)}
      onStop={
        live && turn.status !== "stopping"
          ? () =>
              actions.stop.mutate(turn.id, {
                onError: (error) =>
                  toast.error(actionErrorMessage(error, "We couldn’t stop this work.")),
              })
          : undefined
      }
      stopping={actions.stop.isPending || turn.status === "stopping"}
    />
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
  const { userId, organizationId, turn, openRequest } = props;
  // The tone does not depend on the clock; the status shows the time.
  const status = turnStatus(turn, 0, openRequest);
  if (status.tone === "muted") return <MutedWorkLine label={status.label} />;
  const body = (
    <>
      {turn.status === "failed" && (
        <div className="mt-1 grid max-w-180 gap-1.5">
          <p className="text-xs text-destructive">{failedWorkNote}</p>
          {turn.error?.trim() && <TechnicalDetails>{turn.error}</TechnicalDetails>}
        </div>
      )}
      {turn.status === "needs_attention" && (
        <NeedsAttention
          userId={userId}
          organizationId={organizationId}
          turn={turn}
          agentName={agentName}
          uncertainItemIds={uncertainItemIds}
        />
      )}
    </>
  );
  if (underReply) return body;
  return (
    <PendingReply name={agentName} tone={status.tone} status={<TurnStatus {...props} />}>
      {body}
    </PendingReply>
  );
}
