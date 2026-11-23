import { Link } from "@tanstack/react-router";

import { PendingButton } from "../../feedback/pending-button";
import { NativeField, NativeForm } from "../../forms/native-form";
import { Button } from "../../ui/button";
import { AuthFrame } from "../auth-frame";
import { AuthLink } from "../auth-link";
import { FormMessage } from "@/components/feedback/form-message";
import type { authLink } from "@/lib/auth/navigation";

/**
 * Marks the confirmation invalid while it differs, so the form shows the mismatch inline. After a
 * password change, `revalidate` lets the form refresh an error already shown on the confirmation.
 */
function checkPasswordsMatch(form: HTMLFormElement | null, revalidate = false) {
  const password = form?.elements.namedItem("password");
  const confirm = form?.elements.namedItem("confirm");
  if (!(password instanceof HTMLInputElement) || !(confirm instanceof HTMLInputElement)) return;
  confirm.setCustomValidity(
    confirm.value && confirm.value !== password.value ? "The passwords don’t match." : "",
  );
  if (revalidate) confirm.dispatchEvent(new Event("input", { bubbles: true }));
}

export function ResetPasswordForm({
  invalid = false,
  pending = false,
  success = false,
  error,
  onSubmit,
  loginLink,
  requestResetLink,
}: {
  invalid?: boolean;
  pending?: boolean;
  success?: boolean;
  error?: Error | null;
  onSubmit: (form: FormData) => void;
  loginLink: ReturnType<typeof authLink>;
  requestResetLink: ReturnType<typeof authLink>;
}) {
  const backToSignIn = <AuthLink {...loginLink}>Back to sign in</AuthLink>;

  if (invalid)
    return (
      <AuthFrame
        title="This reset link doesn’t work"
        description="It may have expired or already been used. Request a new one to choose a password."
        footer={backToSignIn}
      >
        <Button asChild size="lg" className="w-full">
          <Link {...requestResetLink}>Request a new link</Link>
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
          <Link {...loginLink}>Sign in</Link>
        </Button>
      </AuthFrame>
    );

  return (
    <AuthFrame
      title="Choose a new password"
      description="Enter a new password for your account."
      footer={
        <>
          Link not working? <AuthLink {...requestResetLink}>Request a new link</AuthLink>
        </>
      }
    >
      <NativeForm pending={pending} onSubmit={onSubmit}>
        <NativeField
          id="password"
          name="password"
          label="New password"
          description="Use at least 8 characters."
          type="password"
          autoComplete="new-password"
          autoFocus
          minLength={8}
          missingMessage="Choose a new password."
          required
          onInput={(event) => checkPasswordsMatch(event.currentTarget.form, true)}
        />
        <NativeField
          id="confirm"
          name="confirm"
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          missingMessage="Enter the new password again."
          required
          // Runs before the form's own input handler, which then reads the updated validity.
          onInput={(event) => checkPasswordsMatch(event.currentTarget.form)}
        />
        <FormMessage
          error={error}
          errorDescription="We couldn’t reset your password. Try again, or request a new reset link."
        />
        <PendingButton
          className="w-full"
          size="lg"
          pending={pending}
          pendingLabel="Save new password"
        >
          Save new password
        </PendingButton>
      </NativeForm>
    </AuthFrame>
  );
}
