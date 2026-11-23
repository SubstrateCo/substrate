import { TechnicalDetails } from "./technical-details";
import { PendingButton } from "@/components/feedback/pending-button";
import { toneBorder, toneFill } from "@/components/feedback/tag";
import { MessageCard, MessageCardBody } from "@/components/messaging/messages/message-card";
import { stoppedNeedsYouLabel } from "@/lib/agent-work/status";
import { cn } from "cn";
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
  inline = false,
}: {
  /** Inside an activity row that already names the state: no card, no header. */
  inline?: boolean;
  text: string;
  /** What the runtime reported when the work stopped. Shown under Technical details only. */
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
  const content = (
    <>
      <p>{text}</p>
      {error?.trim() && <TechnicalDetails>{error}</TechnicalDetails>}
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
    </>
  );
  if (inline)
    return (
      <section
        aria-label={stoppedNeedsYouLabel}
        className={cn(
          "grid min-w-0 gap-2.5 border-t px-4 py-3 text-sm",
          toneBorder.warning,
          toneFill.warning,
        )}
      >
        {content}
      </section>
    );
  return (
    <MessageCard icon={TriangleAlert} tone="attention" title={stoppedNeedsYouLabel}>
      <MessageCardBody>{content}</MessageCardBody>
    </MessageCard>
  );
}
