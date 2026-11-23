import type { KeyboardEventHandler, ReactNode } from "react";

import { FormMessage } from "./form-message";
import { modalDialogProps } from "./modal-dialog";
import { PendingButton } from "@/components/feedback/pending-button";
import { NativeValidationScope } from "@/components/forms/native-form";
import { useNativeValidation } from "@/components/forms/use-native-validation";
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

/**
 * The shell of every modal form. With `nativeValidation`, `NativeField` children validate with
 * the browser's constraints and show product copy inline; otherwise the caller validates
 * (TanStack Form) and the form is `noValidate`.
 */
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
  size = "default",
  pendingLabel = "Saving…",
  disabled = false,
  errorDescription,
  status,
  formId,
  onKeyDown,
  nativeValidation = false,
}: {
  title: string;
  saveLabel: string;
  description: ReactNode;
  children: ReactNode;
  pending: boolean;
  onClose: () => void;
  onSubmit: (form: FormData) => Promise<void> | void;
  error?: Error | string | null;
  errorDescription?: string;
  onRestoreFocus?: () => void;
  size?: "default" | "lg";
  pendingLabel?: string;
  disabled?: boolean;
  status?: string | null;
  formId?: string;
  onKeyDown?: KeyboardEventHandler<HTMLFormElement>;
  nativeValidation?: boolean;
}) {
  const modal = modalDialogProps({ pending, onClose, onRestoreFocus });
  const validation = useNativeValidation();
  return (
    <Dialog {...modal.root}>
      <DialogContent size={size} {...modal.content}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          id={formId}
          onKeyDown={onKeyDown}
          noValidate={!nativeValidation}
          onInvalidCapture={nativeValidation ? validation.onInvalid : undefined}
          onInput={nativeValidation ? validation.onInput : undefined}
          onSubmit={(event) => {
            event.preventDefault();
            if (pending) return;
            void onSubmit(new FormData(event.currentTarget));
          }}
        >
          <DialogBody>
            <FieldSet disabled={pending} className="min-w-0">
              {nativeValidation ? (
                <NativeValidationScope validation={validation}>{children}</NativeValidationScope>
              ) : (
                children
              )}
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
