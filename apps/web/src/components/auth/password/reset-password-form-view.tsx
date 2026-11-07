import { useState } from "react";

import { ContentNotice } from "../../feedback/content-notice";
import { PendingButton } from "../../feedback/pending-button";
import { useNativeValidation } from "../../forms/use-native-validation";
import { Field, FieldDescription, FieldError, FieldLabel } from "../../ui/field";
import { Input } from "../../ui/input";
import { AuthFrame } from "../auth-frame";
import { FormMessage } from "../form-message";

export function ResetPasswordForm({
  invalid = false,
  pending = false,
  success = false,
  error,
  onSubmit,
  loginHref,
  requestResetHref,
}: {
  invalid?: boolean;
  pending?: boolean;
  success?: boolean;
  error?: Error | null;
  onSubmit: (form: FormData) => void;
  loginHref: string;
  requestResetHref: string;
}) {
  const validation = useNativeValidation();
  const [mismatch, setMismatch] = useState("");
  const confirmError = validation.errors.confirm || mismatch;
  return (
    <AuthFrame title="Choose a new password" description="Use at least 8 characters.">
      {invalid && (
        <ContentNotice
          title="Reset link unavailable"
          description="This reset link is missing, invalid, or expired. Request a new link."
        />
      )}
      {!invalid && success && (
        <>
          <FormMessage message="Your password was changed. You can now sign in." />
          <a className="block underline" href={loginHref}>
            Sign in
          </a>
        </>
      )}
      {!invalid && !success && (
        <form
          className="space-y-4"
          onInvalidCapture={validation.onInvalid}
          onInputCapture={(event) => {
            validation.onInput(event);
            setMismatch("");
          }}
          onSubmit={(event) => {
            event.preventDefault();
            if (pending) return;
            const form = new FormData(event.currentTarget);
            if (form.get("password") !== form.get("confirm")) {
              setMismatch("The passwords do not match.");
              event.currentTarget.querySelector<HTMLInputElement>("#confirm")?.focus();
              return;
            }
            onSubmit(form);
          }}
        >
          <Field data-invalid={Boolean(validation.errors.password)}>
            <FieldLabel htmlFor="password">New password</FieldLabel>
            <Input
              {...validation.inputProps("password")}
              aria-describedby={
                validation.errors.password
                  ? "password-description password-error"
                  : "password-description"
              }
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
            <FieldDescription id="password-description">
              Use at least 8 characters.
            </FieldDescription>
            <FieldError id="password-error">{validation.errors.password}</FieldError>
          </Field>
          <Field data-invalid={Boolean(confirmError)}>
            <FieldLabel htmlFor="confirm">Confirm password</FieldLabel>
            <Input
              aria-invalid={Boolean(confirmError)}
              aria-describedby={confirmError ? "confirm-error" : undefined}
              id="confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
            <FieldError id="confirm-error">{confirmError}</FieldError>
          </Field>
          <PendingButton className="w-full" pending={pending} pendingLabel="Saving…">
            Save new password
          </PendingButton>
          <FormMessage
            error={error}
            errorDescription="We couldn’t reset your password. Try again, or request a new reset link."
          />
        </form>
      )}
      <a className="block text-sm underline" href={requestResetHref}>
        Request a new reset link
      </a>
    </AuthFrame>
  );
}
