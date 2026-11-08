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

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  pendingLabel,
  destructive = false,
  confirmDisabled = false,
  pending,
  error,
  onConfirm,
  onClose,
  children,
}: {
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  pendingLabel: string;
  destructive?: boolean;
  confirmDisabled?: boolean;
  pending: boolean;
  error?: Error | null;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="wrap-anywhere">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error.message}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={onClose}>
            {confirmLabel ? "Cancel" : "Close"}
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
