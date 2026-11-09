import { MessageCard, MessageCardBody } from "@/components/messaging/messages/message-card";
import { Button } from "@/components/ui/button";
import { stoppedNeedsYouLabel } from "@/lib/agent-work/status";
import { AlertTriangle } from "lucide-react";

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
  onRetry,
  onDismiss,
  onStartFresh,
  onResend,
  onDiscard,
}: {
  text: string;
  error: string | null;
  pending: boolean;
  onRetry: () => void;
  onDismiss: () => void;
  onStartFresh: () => void;
  onResend?: () => void;
  onDiscard?: () => void;
}) {
  return (
    <MessageCard icon={AlertTriangle} tone="attention" title={stoppedNeedsYouLabel}>
      <MessageCardBody>
        <p>{text}</p>
        {error && <p className="text-xs wrap-anywhere text-muted-foreground">{error}</p>}
        {onResend && onDiscard ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={pending} onClick={onResend}>
              Resend
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={onDiscard}
            >
              Discard
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={pending} onClick={onRetry}>
              Retry
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={onStartFresh}
            >
              Start fresh
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={onDismiss}>
              Dismiss
            </Button>
          </div>
        )}
      </MessageCardBody>
    </MessageCard>
  );
}
