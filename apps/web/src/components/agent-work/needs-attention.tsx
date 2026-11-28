import type { AgentWorkTurnView } from "@substrate/contracts/agent-work";

import { NeedsAttentionContent, type NeedsAttentionAction } from "./needs-attention-card";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { attentionReasonText } from "@/lib/agent-work/status";
import { useAttentionAction } from "@/queries/agent-work/mutations";

const failures: Record<NeedsAttentionAction, string> = {
  retry: "We couldn’t retry. Try again.",
  dismiss: "We couldn’t dismiss this. Try again.",
  startFresh: "We couldn’t start a fresh session. Try again.",
  resend: "We couldn’t resend the message. Try again.",
  discard: "We couldn’t discard the message. Try again.",
};

export function NeedsAttention({
  turn,
  agentName,
  uncertainItemIds = [],
}: {
  turn: Pick<AgentWorkTurnView, "id" | "attentionReason"> & { error?: string | null };
  agentName: string;
  uncertainItemIds?: readonly string[];
}) {
  const { userId, organizationId } = useWorkspaceScope();
  const attempt = useAttentionAction(userId, organizationId);
  const pending = attempt.isPending ? attempt.variables.kind : undefined;
  const failure = attempt.isError
    ? actionErrorMessage(attempt.error, failures[attempt.variables.kind])
    : undefined;
  const run = (kind: NeedsAttentionAction, ids: readonly string[]) => () =>
    attempt.mutate({ kind, ids });
  const uncertain = turn.attentionReason === "uncertain_input" && uncertainItemIds.length > 0;
  return (
    <NeedsAttentionContent
      text={attentionReasonText(turn.attentionReason, agentName)}
      error={turn.error ?? null}
      pending={pending}
      failure={failure}
      actions={
        uncertain
          ? {
              kind: "uncertain",
              onResend: run("resend", uncertainItemIds),
              onDiscard: run("discard", uncertainItemIds),
            }
          : {
              kind: "stopped",
              onRetry: run("retry", [turn.id]),
              onStartFresh: run("startFresh", [turn.id]),
              onDismiss: run("dismiss", [turn.id]),
            }
      }
    />
  );
}
