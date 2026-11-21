import { PendingButton } from "../../feedback/pending-button";
import { EmailField, NativeField, NativeForm } from "../../forms/native-form";
import { AuthFrame } from "../auth-frame";
import { AuthLink } from "../auth-link";
import { FormMessage } from "@/components/feedback/form-message";
import type { authLink } from "@/lib/auth/navigation";

export function SignupForm({
  pending = false,
  error,
  onSubmit,
  loginLink,
}: {
  pending?: boolean;
  error?: Error | null;
  onSubmit: (form: FormData) => void;
  loginLink: ReturnType<typeof authLink>;
}) {
  return (
    <AuthFrame
      title="Create your account"
      description="A shared home for your team and its work."
      footer={
        <>
          Already have an account? <AuthLink {...loginLink}>Sign in</AuthLink>
        </>
      }
    >
      <NativeForm pending={pending} onSubmit={onSubmit}>
        <NativeField
          id="name"
          name="name"
          label="Name"
          autoComplete="name"
          autoFocus
          missingMessage="Enter your name."
          required
        />
        <EmailField />
        <NativeField
          id="password"
          name="password"
          label="Password"
          description="Use at least 8 characters."
          type="password"
          autoComplete="new-password"
          minLength={8}
          missingMessage="Choose a password."
          required
        />
        <FormMessage
          error={error}
          errorDescription="We couldn’t create your account. Please try again."
        />
        <PendingButton
          className="w-full"
          size="lg"
          pending={pending}
          pendingLabel="Creating account."
        >
          Create account
        </PendingButton>
      </NativeForm>
    </AuthFrame>
  );
}
