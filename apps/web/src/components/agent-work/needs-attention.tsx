import type { AgentTurnView } from "@startup-os/contracts/agent-work";

import { NeedsAttentionCard } from "./needs-attention-card";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { attentionReasonText } from "@/lib/agent-work/status";
import { useLocalWorkActions } from "@/queries/agent-work/mutations";
import { toast } from "sonner";

/**
 * The home desktop's actions for a turn that needs attention. uncertainItemIds are the turn's
 * items the desktop couldn't confirm the agent received; with them, the card offers Resend and
 * Discard for those items.
 */
export function NeedsAttention({
  userId,
  organizationId,
  turn,
  agentName,
  uncertainItemIds = [],
}: {
  userId: string;
  organizationId: string;
  turn: AgentTurnView;
  agentName: string;
  uncertainItemIds?: readonly string[];
}) {
  const actions = useLocalWorkActions(userId, organizationId);
  const fail = (fallback: string) => (error: Error) =>
    toast.error(actionErrorMessage(error, fallback));
  const uncertain = turn.attentionReason === "uncertain_input" && uncertainItemIds.length > 0;
  const forItems = (mutate: (itemId: string) => void) => () => {
    for (const itemId of uncertainItemIds) mutate(itemId);
  };
  return (
    <NeedsAttentionCard
      text={attentionReasonText(turn.attentionReason, agentName)}
      error={turn.error}
      pending={[
        actions.retry,
        actions.dismiss,
        actions.startFresh,
        actions.resend,
        actions.discard,
      ].some((action) => action.isPending)}
      onRetry={() => actions.retry.mutate(turn.id, { onError: fail("We couldn't retry.") })}
      onDismiss={() =>
        actions.dismiss.mutate(turn.id, { onError: fail("We couldn't dismiss this.") })
      }
      onStartFresh={() =>
        actions.startFresh.mutate(turn.id, {
          onError: fail("We couldn't start a fresh session."),
        })
      }
      onResend={
        uncertain
          ? forItems((itemId) =>
              actions.resend.mutate(itemId, { onError: fail("We couldn't resend the message.") }),
            )
          : undefined
      }
      onDiscard={
        uncertain
          ? forItems((itemId) =>
              actions.discard.mutate(itemId, {
                onError: fail("We couldn't discard the message."),
              }),
            )
          : undefined
      }
    />
  );
}
