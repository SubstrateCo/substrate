import type { KeyboardEventHandler, ReactNode } from "react";

import { FormMessage } from "./form-message";
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

export type FormDialogEditor = {
  fields: ReactNode;
  formId?: string;
  pending: boolean;
  disabled?: boolean;
  error?: Error | string | null;
  errorDescription?: string;
  onSubmit: () => Promise<void> | void;
  onKeyDown?: KeyboardEventHandler<HTMLFormElement>;
};

export function FormDialog({
  title,
  saveLabel,
  description,
  children,
  pending,
  onClose,
  onSubmit,
  error,
  onRestoreFocus,
  size = "lg",
  pendingLabel = "Saving…",
  disabled = false,
  errorDescription,
  status,
  formId,
  onKeyDown,
}: {
  title: string;
  saveLabel: string;
  description: ReactNode;
  children: ReactNode;
  pending: boolean;
  onClose: () => void;
  onSubmit: () => Promise<void> | void;
  error?: Error | string | null;
  errorDescription?: string;
  onRestoreFocus?: () => void;
  size?: "default" | "lg";
  pendingLabel?: string;
  disabled?: boolean;
  status?: string | null;
  formId?: string;
  onKeyDown?: KeyboardEventHandler<HTMLFormElement>;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent
        size={size}
        onEscapeKeyDown={(event) => {
          if (pending) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (pending) event.preventDefault();
        }}
        onCloseAutoFocus={
          onRestoreFocus
            ? (event) => {
                event.preventDefault();
                onRestoreFocus();
              }
            : undefined
        }
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          id={formId}
          onKeyDown={onKeyDown}
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
            <FormMessage error={error} errorDescription={errorDescription} />
          </DialogBody>
          <DialogFooter
            className={status !== undefined ? "items-center sm:justify-between" : undefined}
          >
            {status !== undefined && (
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {status}
              </p>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
                Cancel
              </Button>
              <PendingButton
                type="submit"
                disabled={disabled}
                pending={pending}
                pendingLabel={pendingLabel}
              >
                {saveLabel}
              </PendingButton>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
