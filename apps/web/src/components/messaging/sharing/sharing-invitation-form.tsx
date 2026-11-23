import { revalidateLogic, useForm, useSelector } from "@tanstack/react-form";

import type { ReactNode, RefObject } from "react";

import { sharingInvitationSchema } from "./sharing-invitation-validation";
import { FormDialog } from "@/components/feedback/form-dialog";
import { useFocusAfterRender } from "@/components/feedback/use-focus-after-render";
import { FormTextField } from "@/components/forms/form-text-field";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";

export function SharingInvitationForm({
  title,
  available,
  hint,
  pending,
  error,
  inputRef,
  onInvite,
  onClose,
  onRestoreFocus,
  children,
}: {
  title: string;
  available: boolean;
  hint?: string;
  pending: boolean;
  error?: Error | null;
  inputRef: RefObject<HTMLElement | null>;
  onInvite: (email: string, onSuccess: () => void) => void;
  onClose: () => void;
  onRestoreFocus?: () => void;
  children: ReactNode;
}) {
  const focusAfterRender = useFocusAfterRender();
  const form = useForm({
    defaultValues: { email: "", confirmed: false },
    validationLogic: revalidateLogic({ mode: "submit", modeAfterSubmission: "change" }),
    validators: { onDynamic: sharingInvitationSchema },
    onSubmit: ({ value }) => {
      if (!available || pending) return;
      const invitation = sharingInvitationSchema.parse(value);
      onInvite(invitation.email, () => {
        // Keep the acknowledgement for subsequent invitations in this dialog.
        form.reset({ email: "", confirmed: true });
        focusAfterRender(() => inputRef.current);
      });
    },
    onSubmitInvalid: ({ formApi }) => {
      if (!formApi.getFieldMeta("email")?.isValid) inputRef.current?.focus();
      else document.getElementById("sharing-history")?.focus();
    },
  });
  const confirmed = useSelector(form.store, (state) => state.values.confirmed);
  return (
    <FormDialog
      title={title}
      description="Work with people from other organizations. They see this conversation only, never your workspace or its private records."
      saveLabel="Send invitation"
      pending={pending}
      disabled={!available || !confirmed}
      onClose={onClose}
      onRestoreFocus={onRestoreFocus}
      onSubmit={() => form.handleSubmit()}
      error={error}
      errorDescription="We couldn’t send this invitation. Try again."
    >
      {available && (
        <>
          <form.Field name="email">
            {(field) => (
              <FormTextField
                ref={(element: HTMLInputElement | HTMLTextAreaElement | null) => {
                  inputRef.current = element;
                }}
                field={field}
                id="sharing-email"
                type="email"
                label="Invite by email"
                required
                placeholder="name@partner.com"
                autoComplete="off"
                disabled={pending}
                description={hint}
              />
            )}
          </form.Field>
          <form.Field name="confirmed">
            {(field) => (
              <Field data-invalid={!field.state.meta.isValid}>
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="sharing-history"
                    checked={field.state.value}
                    onCheckedChange={(value) => field.handleChange(value === true)}
                    onBlur={field.handleBlur}
                    disabled={pending}
                    aria-invalid={!field.state.meta.isValid}
                    aria-describedby={
                      !field.state.meta.isValid ? "sharing-history-error" : undefined
                    }
                  />
                  <FieldLabel htmlFor="sharing-history">
                    I understand invited people can read all earlier messages
                  </FieldLabel>
                </div>
                {!field.state.meta.isValid && (
                  <FieldError id="sharing-history-error" errors={field.state.meta.errors} />
                )}
              </Field>
            )}
          </form.Field>
          <Separator />
        </>
      )}
      {children}
    </FormDialog>
  );
}
