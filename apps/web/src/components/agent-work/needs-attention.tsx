import type { AgentTurnView } from "@startup-os/contracts/agent-work";

import { NeedsAttentionCard, type NeedsAttentionAction } from "./needs-attention-card";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { attentionReasonText } from "@/lib/agent-work/status";
import { useLocalWorkActions } from "@/queries/agent-work/mutations";

const failures: Record<NeedsAttentionAction, string> = {
  retry: "We couldn't retry. Try again.",
  dismiss: "We couldn't dismiss this. Try again.",
  startFresh: "We couldn't start a fresh session. Try again.",
  resend: "We couldn't resend the message. Try again.",
  discard: "We couldn't discard the message. Try again.",
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
  const actions = useLocalWorkActions(userId, organizationId);
  const tracked = {
    retry: actions.retry,
    dismiss: actions.dismiss,
    startFresh: actions.startFresh,
    resend: actions.resend,
    discard: actions.discard,
  };
  const order: readonly NeedsAttentionAction[] = [
    "retry",
    "dismiss",
    "startFresh",
    "resend",
    "discard",
  ];
  const pending = order.find((action) => tracked[action].isPending);
  let failure: string | undefined;
  for (const action of order) {
    const { error } = tracked[action];
    if (error) {
      failure = actionErrorMessage(error, failures[action]);
      break;
    }
  }
  // Each attempt clears earlier failures, so the card shows only the latest one.
  const run = (action: NeedsAttentionAction, ids: readonly string[]) => () => {
    for (const name of order) tracked[name].reset();
    for (const id of ids) tracked[action].mutate(id);
  };
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
