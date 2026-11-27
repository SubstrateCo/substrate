import type { ReactNode } from "react";

import { TechnicalDetails } from "./technical-details";
import { PendingButton } from "@/components/feedback/pending-button";
import { toneBorder, toneFill } from "@/components/feedback/tag-styles";
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
 * What the owner can do. Retry resumes the same session; Start fresh begins a new session with a
 * handoff; Dismiss leaves it stopped. When the desktop couldn't confirm that the agent received
 * a message, Resend submits it again and Discard drops it, because a retry could deliver it twice.
 */
export type NeedsAttentionActions =
  | { kind: "stopped"; onRetry: () => void; onStartFresh: () => void; onDismiss: () => void }
  | { kind: "uncertain"; onResend: () => void; onDiscard: () => void };

/** Work that stopped and will not continue on its own: why, and what the owner can do. */
export function NeedsAttentionContent({
  text,
  error,
  pending,
  failure,
  actions,
}: {
  text: string;
  /** What the runtime reported when the work stopped. Shown under Technical details only. */
  error: string | null;
  /** The action being sent, if any. */
  pending?: NeedsAttentionAction;
  /** Reviewed copy for the last failed action. */
  failure?: string;
  actions: NeedsAttentionActions;
}) {
  return (
    <>
      <p>{text}</p>
      {error?.trim() && <TechnicalDetails>{error}</TechnicalDetails>}
      {failure && (
        <p role="alert" className="flex items-start gap-1.5 text-xs text-destructive">
          <CircleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          {failure}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <AttentionActions actions={actions} pending={pending} />
      </div>
    </>
  );
}

function AttentionActions({
  actions,
  pending,
}: {
  actions: NeedsAttentionActions;
  pending?: NeedsAttentionAction;
}) {
  if (actions.kind === "uncertain")
    return (
      <>
        <StopAction action="resend" pending={pending} variant="default" onClick={actions.onResend}>
          Resend
        </StopAction>
        <StopAction action="discard" pending={pending} onClick={actions.onDiscard}>
          Discard
        </StopAction>
      </>
    );
  return (
    <>
      <StopAction action="retry" pending={pending} variant="default" onClick={actions.onRetry}>
        Retry
      </StopAction>
      <StopAction action="startFresh" pending={pending} onClick={actions.onStartFresh}>
        Start fresh
      </StopAction>
      <StopAction action="dismiss" pending={pending} variant="ghost" onClick={actions.onDismiss}>
        Dismiss
      </StopAction>
    </>
  );
}

/** Stopped work as its own card, with a header that names the state. */
export function NeedsAttentionCard({ children }: { children: ReactNode }) {
  return (
    <MessageCard icon={TriangleAlert} tone="attention" title={stoppedNeedsYouLabel}>
      <MessageCardBody>{children}</MessageCardBody>
    </MessageCard>
  );
}

/** Stopped work inside an activity row that already names the state: no card, no header. */
export function NeedsAttentionInline({ children }: { children: ReactNode }) {
  return (
    <section
      aria-label={stoppedNeedsYouLabel}
      className={cn(
        "grid min-w-0 gap-2.5 border-t px-4 py-3 text-sm",
        toneBorder.warning,
        toneFill.warning,
      )}
    >
      {children}
    </section>
  );
}
