import { PendingButton } from "@/components/feedback/pending-button";
import { MessageCard, MessageCardBody } from "@/components/messaging/messages/message-card";
import { stoppedNeedsYouLabel } from "@/lib/agent-work/status";
import { CircleAlert, TriangleAlert } from "lucide-react";

export type NeedsAttentionAction = "retry" | "dismiss" | "startFresh" | "resend" | "discard";

/**
 * Work that stopped and will not continue on its own. Retry resumes the same session; Start
 * fresh begins a new session with a handoff; Dismiss leaves it stopped. When the desktop
 * couldn't confirm that the agent received a message, Resend submits it again and Discard drops
 * it, because a retry could deliver it twice.
 */
export function NeedsAttentionCard({
  text,
  error,
  pending,
  failure,
  onRetry,
  onDismiss,
  onStartFresh,
  onResend,
  onDiscard,
}: {
  text: string;
  /** What the runtime reported when the work stopped. */
  error: string | null;
  /** The action being sent, if any. */
  pending?: NeedsAttentionAction;
  /** Reviewed copy for the last failed action. */
  failure?: string;
  onRetry: () => void;
  onDismiss: () => void;
  onStartFresh: () => void;
  onResend?: () => void;
  onDiscard?: () => void;
}) {
  const busy = !!pending;
  const button = (
    action: NeedsAttentionAction,
    label: string,
    pendingLabel: string,
    onClick: () => void,
    variant: "default" | "outline" | "ghost" = "outline",
  ) => (
    <PendingButton
      type="button"
      size="sm"
      variant={variant}
      disabled={busy}
      pending={pending === action}
      pendingLabel={pendingLabel}
      onClick={onClick}
    >
      {label}
    </PendingButton>
  );
  return (
    <MessageCard icon={TriangleAlert} tone="attention" title={stoppedNeedsYouLabel}>
      <MessageCardBody>
        <p>{text}</p>
        {error && <p className="text-xs wrap-anywhere text-muted-foreground">{error}</p>}
        {failure && (
          <p role="alert" className="flex items-start gap-1.5 text-xs text-destructive">
            <CircleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
            {failure}
          </p>
        )}
        {onResend && onDiscard ? (
          <div className="flex flex-wrap gap-2">
            {button("resend", "Resend", "Resending…", onResend, "default")}
            {button("discard", "Discard", "Discarding…", onDiscard)}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {button("retry", "Retry", "Retrying…", onRetry, "default")}
            {button("startFresh", "Start fresh", "Starting fresh…", onStartFresh)}
            {button("dismiss", "Dismiss", "Dismissing…", onDismiss, "ghost")}
          </div>
        )}
      </MessageCardBody>
    </MessageCard>
  );
}
