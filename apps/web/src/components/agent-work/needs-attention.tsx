import type { AgentTurnView } from "@substrate/contracts/agent-work";

import { NeedsAttentionCard, type NeedsAttentionAction } from "./needs-attention-card";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { attentionReasonText } from "@/lib/agent-work/status";
import { useAttentionAction } from "@/queries/agent-work/mutations";

const failures: Record<NeedsAttentionAction, string> = {
  retry: "We couldn’t retry. Try again.",
  dismiss: "We couldn’t dismiss this. Try again.",
  startFresh: "We couldn’t start a fresh session. Try again.",
  resend: "We couldn’t resend the message. Try again.",
  discard: "We couldn’t discard the message. Try again.",
};

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
  inline = false,
}: {
  /** Render without a card header, inside a row that names the state. */
  inline?: boolean;
  userId: string;
  organizationId: string;
  turn: AgentTurnView;
  agentName: string;
  uncertainItemIds?: readonly string[];
}) {
  // One mutation, so the card shows only the latest attempt and its failure.
  const attempt = useAttentionAction(userId, organizationId);
  const pending = attempt.isPending ? attempt.variables.kind : undefined;
  const failure = attempt.isError
    ? actionErrorMessage(attempt.error, failures[attempt.variables.kind])
    : undefined;
  const run = (kind: NeedsAttentionAction, ids: readonly string[]) => () =>
    attempt.mutate({ kind, ids });
  const uncertain = turn.attentionReason === "uncertain_input" && uncertainItemIds.length > 0;
  return (
    <NeedsAttentionCard
      inline={inline}
      text={attentionReasonText(turn.attentionReason, agentName)}
      error={turn.error}
      pending={pending}
      failure={failure}
      onRetry={run("retry", [turn.id])}
      onDismiss={run("dismiss", [turn.id])}
      onStartFresh={run("startFresh", [turn.id])}
      onResend={uncertain ? run("resend", uncertainItemIds) : undefined}
      onDiscard={uncertain ? run("discard", uncertainItemIds) : undefined}
    />
  );
}
