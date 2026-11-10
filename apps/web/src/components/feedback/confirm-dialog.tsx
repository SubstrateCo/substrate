import type { ReactNode } from "react";

import { FormMessage } from "@/components/auth/form-message";
import { PendingButton } from "@/components/feedback/pending-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ConfirmAction =
  | { confirmLabel?: undefined; pendingLabel?: undefined; onConfirm?: undefined }
  | { confirmLabel: string; pendingLabel: string; onConfirm: () => void };

/**
 * Without confirmLabel, the dialog only informs and offers Close. A destructive confirm uses the
 * solid red button; give it a specific verb, such as "Delete channel" or "Remove Bob".
 */
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  pendingLabel,
  cancelLabel = "Cancel",
  destructive = false,
  confirmDisabled = false,
  pending = false,
  error,
  errorDescription,
  onConfirm,
  onClose,
  onRestoreFocus,
  children,
}: ConfirmAction & {
  title: string;
  description: ReactNode;
  cancelLabel?: string;
  destructive?: boolean;
  confirmDisabled?: boolean;
  pending?: boolean;
  error?: Error | null;
  /** Shown when the error is not a reviewed, user-facing message. */
  errorDescription?: string;
  onClose: () => void;
  /** Focus a specific element on close instead of the element that opened the dialog. */
  onRestoreFocus?: () => void;
  children?: ReactNode;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent
        onCloseAutoFocus={(event) => {
          if (!onRestoreFocus) return;
          event.preventDefault();
          onRestoreFocus();
        }}
      >
        <DialogHeader>
          <DialogTitle className="wrap-anywhere">{title}</DialogTitle>
          <DialogDescription className="wrap-anywhere">{description}</DialogDescription>
        </DialogHeader>
        {(children || error) && (
          <DialogBody>
            {children}
            <FormMessage error={error} errorDescription={errorDescription} />
          </DialogBody>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={onClose}>
            {confirmLabel ? cancelLabel : "Close"}
          </Button>
          {confirmLabel && (
            <PendingButton
              variant={destructive ? "destructive" : "default"}
              disabled={confirmDisabled}
              pending={pending}
              pendingLabel={pendingLabel}
              onClick={onConfirm}
            >
              {confirmLabel}
            </PendingButton>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
