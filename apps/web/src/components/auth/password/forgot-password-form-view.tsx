import { PendingButton } from "../../feedback/pending-button";
import { EmailField, NativeForm } from "../../forms/native-form";
import { Button } from "../../ui/button";
import { AuthFrame } from "../auth-frame";
import { AuthLink } from "../auth-link";
import { FormMessage } from "@/components/feedback/form-message";
import type { authLink } from "@/lib/auth/navigation";

export function ForgotPasswordForm({
  pending = false,
  success = false,
  error,
  onSubmit,
  onReset,
  loginLink,
}: {
  pending?: boolean;
  success?: boolean;
  error?: Error | null;
  onSubmit: (form: FormData) => void;
  onReset: () => void;
  loginLink: ReturnType<typeof authLink>;
}) {
  const footer = <AuthLink {...loginLink}>Back to sign in</AuthLink>;
  if (success)
    return (
      <AuthFrame
        title="Check your inbox"
        description="If an account exists for that email, we sent a link to choose a new password."
        footer={footer}
      >
        <Button type="button" variant="outline" size="lg" className="w-full" onClick={onReset}>
          Use a different email
        </Button>
      </AuthFrame>
    );
  return (
    <AuthFrame
      title="Reset your password"
      description="Enter your account email. We’ll send you a link to choose a new password."
      footer={footer}
    >
      <NativeForm pending={pending} onSubmit={onSubmit}>
        <EmailField autoFocus />
        <FormMessage
          error={error}
          errorDescription="We couldn’t send a reset link. Please try again."
        />
        <PendingButton
          className="w-full"
          size="lg"
          pending={pending}
          pendingLabel="Send reset link"
        >
          Send reset link
        </PendingButton>
      </NativeForm>
    </AuthFrame>
  );
}
