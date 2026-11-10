import { PendingButton } from "../../feedback/pending-button";
import { EmailField, NativeForm } from "../../forms/native-form";
import { AuthFrame } from "../auth-frame";
import { FormMessage } from "../form-message";

export function ForgotPasswordForm({
  pending = false,
  success = false,
  error,
  onSubmit,
  loginHref,
}: {
  pending?: boolean;
  success?: boolean;
  error?: Error | null;
  onSubmit: (form: FormData) => void;
  loginHref: string;
}) {
  return (
    <AuthFrame
      title="Reset your password"
      description="We will send a reset link if an account exists for this email."
    >
      <NativeForm pending={pending} onSubmit={onSubmit}>
        <EmailField />
        <PendingButton className="w-full" pending={pending} pendingLabel="Sending…">
          Send reset link
        </PendingButton>
        <FormMessage
          error={error}
          errorDescription="We couldn’t send a reset link. Please try again."
          message={success ? "Check your inbox for a password reset link." : undefined}
        />
      </NativeForm>
      <a className="block text-sm underline" href={loginHref}>
        Back to sign in
      </a>
    </AuthFrame>
  );
}
