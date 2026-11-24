import type { ReactNode } from "react";

import { FormMessage } from "@/components/feedback/form-message";
import { modalDialogProps } from "@/components/feedback/modal-dialog";
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
  | { confirmLabel?: undefined; onConfirm?: undefined }
  | { confirmLabel: string; onConfirm: () => void };

/**
 * Without confirmLabel, the dialog only informs and offers Close. A destructive confirm uses the
 * solid red button; give it a specific verb, such as "Delete channel" or "Remove Bob".
 */
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = false,
  confirmDisabled = false,
  pending = false,
  error,
  errorDescription,
  onConfirm,
  onClose,
  onRestoreFocus,
  status,
  children,
}: ConfirmAction & {
  title: string;
  description: ReactNode;
  cancelLabel?: string;
  destructive?: boolean;
  confirmDisabled?: boolean;
  pending?: boolean;
  error?: Error | string | null;
  /** Shown when the error is not a reviewed, user-facing message. */
  errorDescription?: string;
  onClose: () => void;
  /** Focus a specific element on close instead of the element that opened the dialog. */
  onRestoreFocus?: () => void;
  /** Why the confirm button is disabled, on the footer's left ("Choose a new owner"). */
  status?: string;
  children?: ReactNode;
}) {
  const modal = modalDialogProps({ pending, onClose, onRestoreFocus });
  return (
    <Dialog {...modal.root}>
      <DialogContent {...modal.content}>
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
        <DialogFooter
          className={status !== undefined ? "sm:flex-wrap sm:justify-between" : undefined}
        >
          {status !== undefined && (
            <p
              className="min-w-0 text-sm wrap-anywhere text-muted-foreground sm:flex-1"
              aria-live="polite"
            >
              {status}
            </p>
          )}
          <div className="flex w-full max-w-full min-w-0 flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:flex-wrap [&_button]:h-auto [&_button]:max-w-full [&_button]:py-1 [&_button]:wrap-anywhere [&_button]:whitespace-normal sm:[&_button]:min-h-8">
            <Button variant="outline" disabled={pending} onClick={onClose}>
              {confirmLabel ? cancelLabel : "Close"}
            </Button>
            {confirmLabel && (
              <PendingButton
                variant={destructive ? "destructive" : "default"}
                disabled={confirmDisabled}
                pending={pending}
                onClick={onConfirm}
              >
                {confirmLabel}
              </PendingButton>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
