import type { ReactNode } from "react";

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
import { FieldSet } from "@/components/ui/field";

export function EditorDialog({
  title,
  saveLabel,
  description,
  children,
  pending,
  onClose,
  onSubmit,
  error,
}: {
  title: string;
  saveLabel: string;
  description: string;
  children: ReactNode;
  pending: boolean;
  onClose: () => void;
  onSubmit: () => Promise<void>;
  error?: string;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (pending) return;
            void onSubmit();
          }}
        >
          <DialogBody>
            <FieldSet disabled={pending} className="min-w-0">
              {children}
            </FieldSet>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
              Cancel
            </Button>
            <PendingButton type="submit" pending={pending} pendingLabel="Saving…">
              {saveLabel}
            </PendingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
