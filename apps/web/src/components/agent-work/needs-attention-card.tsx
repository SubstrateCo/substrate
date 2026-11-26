import type { ReactNode } from "react";

import { TechnicalDetails } from "./technical-details";
import { PendingButton } from "@/components/feedback/pending-button";
import { toneBorder, toneFill } from "@/components/feedback/tag";
import { MessageCard, MessageCardBody } from "@/components/messaging/messages/message-card";
import { stoppedNeedsYouLabel } from "@/lib/agent-work/status";
import { cn } from "cn";
import { CircleAlert, TriangleAlert } from "lucide-react";

export type NeedsAttentionAction = "retry" | "dismiss" | "startFresh" | "resend" | "discard";

/** One action on stopped work. While any action is sent, every action is disabled. */
function StopAction({
  action,
  pending,
  variant = "outline",
  onClick,
  children,
}: {
  action: NeedsAttentionAction;
  pending?: NeedsAttentionAction;
  variant?: "default" | "outline" | "ghost";
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <PendingButton
      type="button"
      size="sm"
      variant={variant}
      disabled={!!pending}
      pending={pending === action}
      onClick={onClick}
    >
      {children}
    </PendingButton>
  );
}

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
          <StopAction action="resend" pending={pending} variant="default" onClick={onResend}>
            Resend
          </StopAction>
          <StopAction action="discard" pending={pending} onClick={onDiscard}>
            Discard
          </StopAction>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <StopAction action="retry" pending={pending} variant="default" onClick={onRetry}>
            Retry
          </StopAction>
          <StopAction action="startFresh" pending={pending} onClick={onStartFresh}>
            Start fresh
          </StopAction>
          <StopAction action="dismiss" pending={pending} variant="ghost" onClick={onDismiss}>
            Dismiss
          </StopAction>
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
