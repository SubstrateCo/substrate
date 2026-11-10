import type { ReactNode } from "react";

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

type ConfirmAction =
  | { confirmLabel?: undefined; pendingLabel?: undefined; onConfirm?: undefined }
  | { confirmLabel: string; pendingLabel: string; onConfirm: () => void };

/** Without confirmLabel, the dialog only informs and offers Close. */
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
        {children}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error.message}
          </p>
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
