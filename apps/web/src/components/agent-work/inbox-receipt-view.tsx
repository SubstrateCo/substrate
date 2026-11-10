import { useState } from "react";

import { PendingButton } from "@/components/feedback/pending-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { WorkTone } from "@/lib/agent-work/status";
import { cn } from "cn";
import { Clock } from "lucide-react";

const sendNowDescription = "Stops the current work and starts again with this message";

/**
 * Under an owner message the agent has not started on yet: where it waits. When the agent is
 * busy and cannot take the message into its current work, Send now interrupts that work. When
 * the desktop couldn't confirm the agent received it, Resend submits it again and Discard drops it.
 */
export function InboxReceiptView({
  label,
  tone,
  onSendNow,
  sending,
  onResend,
  onDiscard,
  resolving = false,
}: {
  label: string;
  tone: WorkTone;
  onSendNow?: () => void;
  sending: boolean;
  onResend?: () => void;
  onDiscard?: () => void;
  resolving?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
      <Clock aria-hidden="true" className="size-3.5 shrink-0" />
      <span
        role="status"
        className={cn("tabular-nums", tone === "attention" && "font-medium text-warning")}
      >
        {label}
      </span>
      {onSendNow && (
        <Button
          type="button"
          size="xs"
          variant="link"
          disabled={sending}
          onClick={() => setConfirming(true)}
        >
          Send now
        </Button>
      )}
      {onResend && (
        <Button type="button" size="xs" variant="link" disabled={resolving} onClick={onResend}>
          Resend
        </Button>
      )}
      {onDiscard && (
        <Button type="button" size="xs" variant="link" disabled={resolving} onClick={onDiscard}>
          Discard
        </Button>
      )}
      {confirming && onSendNow && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !sending) setConfirming(false);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Send now?</DialogTitle>
              <DialogDescription>{sendNowDescription}.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" disabled={sending} onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <PendingButton
                pending={sending}
                pendingLabel="Sending"
                onClick={() => {
                  onSendNow();
                  setConfirming(false);
                }}
              >
                Send now
              </PendingButton>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
