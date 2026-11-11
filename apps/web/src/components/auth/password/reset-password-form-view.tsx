import { useState } from "react";

import { PendingButton } from "../../feedback/pending-button";
import { useNativeValidation } from "../../forms/use-native-validation";
import { Button } from "../../ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "../../ui/field";
import { Input } from "../../ui/input";
import { AuthFrame } from "../auth-frame";
import { AuthLink } from "../auth-link";
import { FormMessage } from "@/components/feedback/form-message";

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
  const passwordError = validation.errors.password;
  const confirmError = validation.errors.confirm || mismatch;
  const backToSignIn = <AuthLink href={loginHref}>Back to sign in</AuthLink>;

  if (invalid)
    return (
      <AuthFrame
        title="This reset link doesn’t work"
        description="It may have expired or already been used. Request a new one to choose a password."
        footer={backToSignIn}
      >
        <Button asChild size="lg" className="w-full">
          <a href={requestResetHref}>Request a new link</a>
        </Button>
      </AuthFrame>
    );

  if (success)
    return (
      <AuthFrame
        title="Password changed"
        description="Your password was changed. You can now sign in."
      >
        <Button asChild size="lg" className="w-full">
          <a href={loginHref}>Sign in</a>
        </Button>
      </AuthFrame>
    );

  return (
    <AuthFrame
      title="Choose a new password"
      description="Enter a new password for your account."
      footer={
        <>
          Link not working? <AuthLink href={requestResetHref}>Request a new link</AuthLink>
        </>
      }
    >
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
            setMismatch("The passwords don’t match.");
            event.currentTarget.querySelector<HTMLInputElement>("#confirm")?.focus();
            return;
          }
          onSubmit(form);
        }}
      >
        <Field data-invalid={Boolean(passwordError)}>
          <FieldLabel htmlFor="password">New password</FieldLabel>
          <Input
            {...validation.inputProps("password")}
            aria-describedby={passwordError ? "password-error" : "password-description"}
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            autoFocus
            minLength={8}
            data-missing-message="Choose a new password."
            required
          />
          {passwordError ? (
            <FieldError id="password-error">{passwordError}</FieldError>
          ) : (
            <FieldDescription id="password-description">
              Use at least 8 characters.
            </FieldDescription>
          )}
        </Field>
        <Field data-invalid={Boolean(confirmError)}>
          <FieldLabel htmlFor="confirm">Confirm password</FieldLabel>
          <Input
            aria-invalid={confirmError ? true : undefined}
            aria-describedby={confirmError ? "confirm-error" : undefined}
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            minLength={8}
            data-missing-message="Enter the new password again."
            required
          />
          <FieldError id="confirm-error">{confirmError}</FieldError>
        </Field>
        <FormMessage
          error={error}
          errorDescription="We couldn’t reset your password. Try again, or request a new reset link."
        />
        <PendingButton className="w-full" size="lg" pending={pending} pendingLabel="Saving.">
          Save new password
        </PendingButton>
      </form>
    </AuthFrame>
  );
}
